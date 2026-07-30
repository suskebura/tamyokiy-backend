# backend/optimizer/optimizer.py
import json
import requests
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS
from ortools.constraint_solver import routing_enums_pb2
from ortools.constraint_solver import pywrapcp
import math
import time
from datetime import datetime, timedelta

app = Flask(__name__)
CORS(app)

# ============================================================
# 🗺️ DISTANCE MATRIX
# ============================================================

def get_distance_matrix(coordinates):
    """Get distance matrix from OSRM or fallback to Haversine"""
    if len(coordinates) < 2:
        return [[0]]

    coords_str = ";".join([f"{lng},{lat}" for lat, lng in coordinates])

    try:
        url = f"http://router.project-osrm.org/table/v1/driving/{coords_str}?annotations=distance"
        response = requests.get(url, timeout=5)
        data = response.json()

        if 'distances' in data:
            matrix = np.array(data['distances']) / 1000
            return matrix.tolist()
    except Exception as e:
        print(f"⚠️ OSRM error: {e}")

    print("📍 Using Haversine fallback")
    return get_haversine_matrix(coordinates)

def get_haversine_matrix(coordinates):
    n = len(coordinates)
    matrix = [[0] * n for _ in range(n)]
    for i in range(n):
        for j in range(i+1, n):
            dist = haversine(coordinates[i][0], coordinates[i][1], coordinates[j][0], coordinates[j][1])
            matrix[i][j] = dist
            matrix[j][i] = dist
    return matrix

def haversine(lat1, lng1, lat2, lng2):
    R = 6371
    lat1, lng1, lat2, lng2 = map(math.radians, [lat1, lng1, lat2, lng2])
    dlat = lat2 - lat1
    dlng = lng2 - lng1
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng/2)**2
    c = 2 * math.asin(math.sqrt(a))
    return R * c

# ============================================================
# 🧠 VRP SOLVER
# ============================================================

def solve_vrp(distance_matrix, num_vehicles=1, depot_index=0, depot_indices=None, max_stops_per_vehicle=None, time_windows=None):
    """Solve Vehicle Routing Problem with advanced features"""
    n = len(distance_matrix)

    if n <= 2:
        single_route = list(range(n))
        cleaned = [node for node in single_route if node != depot_index]
        cleaned_routes = [cleaned] if cleaned else []
        raw_routes = [single_route] if len(single_route) > 1 else []
        return cleaned, cleaned_routes, raw_routes

    num_vehicles = max(1, int(num_vehicles))
    if depot_index >= n or depot_index < 0:
        depot_index = 0

    if depot_indices and len(depot_indices) == num_vehicles and all(0 <= d < n for d in depot_indices):
        starts = list(depot_indices)
        ends = list(depot_indices)
        depot_set = set(depot_indices)
    else:
        starts = [depot_index] * num_vehicles
        ends = [depot_index] * num_vehicles
        depot_set = {depot_index}

    print(f"📊 Solving VRP with {n} nodes, {num_vehicles} vehicles, depots={sorted(depot_set)}")

    # Use multi-depot if multiple depots
    if len(starts) == len(set(starts)) == num_vehicles and num_vehicles > 1 and len(depot_set) > 1:
        manager = pywrapcp.RoutingIndexManager(n, num_vehicles, starts, ends)
    else:
        manager = pywrapcp.RoutingIndexManager(n, num_vehicles, depot_index)

    routing = pywrapcp.RoutingModel(manager)

    def distance_callback(from_index, to_index):
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        return int(distance_matrix[from_node][to_node] * 1000 + 0.5)

    transit_callback_index = routing.RegisterTransitCallback(distance_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_callback_index)

    max_distance_meters = 50000000

    routing.AddDimension(
        transit_callback_index,
        0,
        max_distance_meters,
        True,
        'Distance'
    )
    distance_dimension = routing.GetDimensionOrDie('Distance')
    distance_dimension.SetGlobalSpanCostCoefficient(100)

    # --- Capacity constraint ---
    num_customers = n - len(depot_set)
    if num_vehicles > 1 and num_customers > 0:
        if max_stops_per_vehicle is None:
            max_stops_per_vehicle = math.ceil(num_customers / num_vehicles) + 1
        max_stops_per_vehicle = int(max_stops_per_vehicle)

        min_required = math.ceil(num_customers / num_vehicles)
        if max_stops_per_vehicle < min_required:
            max_stops_per_vehicle = min_required

        vehicle_capacities = [max_stops_per_vehicle] * num_vehicles
        print(f"📊 Capacity: {max_stops_per_vehicle} stops per vehicle")

        def demand_callback(from_index):
            node = manager.IndexToNode(from_index)
            return 0 if node in depot_set else 1

        demand_callback_index = routing.RegisterUnaryTransitCallback(demand_callback)
        routing.AddDimensionWithVehicleCapacity(
            demand_callback_index,
            0,
            vehicle_capacities,
            True,
            'Capacity'
        )

    # --- 🔥 TIME WINDOWS SUPPORT ---
    if time_windows:
        print(f"⏰ Adding time windows constraints...")
        time_windows_list = []
        for i in range(n):
            if i in depot_set:
                time_windows_list.append((0, 24 * 60))  # Depot: all day
            elif i < len(time_windows):
                tw = time_windows[i]
                if isinstance(tw, dict):
                    time_windows_list.append((tw.get('start', 0), tw.get('end', 24 * 60)))
                else:
                    time_windows_list.append((0, 24 * 60))
            else:
                time_windows_list.append((0, 24 * 60))

        def time_callback(from_index, to_index):
            from_node = manager.IndexToNode(from_index)
            to_node = manager.IndexToNode(to_index)
            return int(distance_matrix[from_node][to_node] * 1000 + 0.5)

        time_callback_index = routing.RegisterTransitCallback(time_callback)

        routing.AddDimension(
            time_callback_index,
            30,  # slack
            24 * 60,  # max time
            False,
            'Time'
        )
        time_dimension = routing.GetDimensionOrDie('Time')

        for i in range(n):
            if i not in depot_set:
                index = manager.NodeToIndex(i)
                time_dimension.CumulVar(index).SetRange(
                    time_windows_list[i][0],
                    time_windows_list[i][1]
                )

    # --- 🔥 FORCE MULTI-VEHICLE ---
    for vehicle_id in range(num_vehicles):
        routing.SetFixedCostOfVehicle(10000, vehicle_id)

    for vehicle_id in range(num_vehicles):
        routing.AddVariableMinimizedByFinalizer(
            distance_dimension.CumulVar(routing.Start(vehicle_id))
        )

    search_parameters = pywrapcp.DefaultRoutingSearchParameters()
    search_parameters.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    search_parameters.local_search_metaheuristic = routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    search_parameters.time_limit.seconds = 30
    search_parameters.log_search = False

    solution = routing.SolveWithParameters(search_parameters)

    if not solution:
        for fallback_strategy in (
            routing_enums_pb2.FirstSolutionStrategy.SAVINGS,
            routing_enums_pb2.FirstSolutionStrategy.PARALLEL_CHEAPEST_INSERTION,
            routing_enums_pb2.FirstSolutionStrategy.CHRISTOFIDES,
        ):
            print(f"⚠️ Retrying with strategy {fallback_strategy}...")
            search_parameters.first_solution_strategy = fallback_strategy
            solution = routing.SolveWithParameters(search_parameters)
            if solution:
                break

    if not solution:
        print("⚠️ No feasible solution. Falling back to round-robin split.")
        customers = [node for node in range(n) if node not in depot_set]
        cleaned_routes = [[] for _ in range(num_vehicles)]
        for i, node in enumerate(customers):
            cleaned_routes[i % num_vehicles].append(node)

        raw_routes = []
        kept_cleaned_routes = []
        for vehicle_id, r in enumerate(cleaned_routes):
            if not r:
                continue
            vehicle_start = starts[vehicle_id] if vehicle_id < len(starts) else depot_index
            vehicle_end = ends[vehicle_id] if vehicle_id < len(ends) else depot_index
            raw_routes.append([vehicle_start] + r + [vehicle_end])
            kept_cleaned_routes.append(r)

        flat_route = [node for route in kept_cleaned_routes for node in route]
        return flat_route, kept_cleaned_routes, raw_routes

    raw_routes = []
    for vehicle_id in range(num_vehicles):
        route = []
        index = routing.Start(vehicle_id)
        while not routing.IsEnd(index):
            node = manager.IndexToNode(index)
            route.append(node)
            index = solution.Value(routing.NextVar(index))
        end_node = manager.IndexToNode(index)
        route.append(end_node)
        raw_routes.append(route)

    print(f"📊 Raw per-vehicle routes: {raw_routes}")

    cleaned_routes = []
    for route in raw_routes:
        cleaned = [node for node in route if node not in depot_set]
        if cleaned:
            cleaned_routes.append(cleaned)

    flat_route = []
    for route in cleaned_routes:
        flat_route.extend(route)

    print(f"📊 OR-Tools found routes: {cleaned_routes}")
    return flat_route, cleaned_routes, raw_routes

# ============================================================
# 🎯 REAL-TIME TRAFFIC & WEATHER FACTORS
# ============================================================

def get_traffic_factor(origin_lat, origin_lng, dest_lat, dest_lng):
    """Get real-time traffic factor from OSRM (free)"""
    try:
        url = f"http://router.project-osrm.org/route/v1/driving/{origin_lng},{origin_lat};{dest_lng},{dest_lat}?overview=false"
        response = requests.get(url, timeout=3)
        data = response.json()
        if data['code'] == 'Ok' and data['routes']:
            duration = data['routes'][0]['duration']
            # Compare with ideal (60 km/h)
            distance = data['routes'][0]['distance'] / 1000
            ideal_duration = (distance / 60) * 3600
            if ideal_duration > 0:
                factor = duration / ideal_duration
                return min(max(factor, 0.5), 3.0)  # Clamp between 0.5 and 3.0
    except:
        pass
    return 1.0

def get_weather_factor(lat, lng):
    """Get weather factor from OpenWeatherMap"""
    api_key = 'YOUR_OPENWEATHER_API_KEY'  # Replace with env var
    if not api_key or api_key == 'YOUR_OPENWEATHER_API_KEY':
        return 1.0, 'Unknown'
    
    try:
        url = f"https://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lng}&appid={api_key}"
        response = requests.get(url, timeout=3)
        data = response.json()
        condition = data.get('weather', [{}])[0].get('main', 'Clear')
        
        factors = {
            'Clear': 1.0,
            'Clouds': 1.05,
            'Rain': 1.2,
            'Drizzle': 1.15,
            'Thunderstorm': 1.4,
            'Snow': 1.5,
            'Fog': 1.2,
            'Mist': 1.15
        }
        return factors.get(condition, 1.0), condition
    except:
        return 1.0, 'Unknown'

# ============================================================
# 🚀 MAIN OPTIMIZATION ENDPOINT
# ============================================================

@app.route('/optimize', methods=['POST'])
def optimize_route():
    start_time = time.time()
    
    try:
        data = request.json
        stops = data.get('stops', [])
        num_vehicles = data.get('num_vehicles', 1)
        depot_index = data.get('depot_index', 0)
        depot_indices = data.get('depot_indices')
        max_stops_per_vehicle = data.get('max_stops_per_vehicle')
        include_traffic = data.get('include_traffic', True)
        include_weather = data.get('include_weather', True)
        time_windows = data.get('time_windows', None)

        try:
            num_vehicles = max(1, int(num_vehicles))
        except (TypeError, ValueError):
            num_vehicles = 1

        if depot_indices is not None:
            try:
                depot_indices = [int(d) for d in depot_indices]
            except (TypeError, ValueError):
                depot_indices = None
            if depot_indices and len(depot_indices) != num_vehicles:
                print(f"⚠️ depot_indices length ({len(depot_indices)}) != num_vehicles ({num_vehicles}), ignoring")
                depot_indices = None

        print(f"\n🚛 Optimizing {len(stops)} stops with {num_vehicles} vehicles")

        if len(stops) < 2:
            return jsonify({
                'success': True,
                'optimized_stops': stops,
                'total_distance': 0,
                'message': 'Need at least 2 stops'
            })

        if depot_index < 0 or depot_index >= len(stops):
            depot_index = 0

        if depot_indices and not all(0 <= d < len(stops) for d in depot_indices):
            print("⚠️ depot_indices contains out-of-range values, ignoring")
            depot_indices = None

        # ===== EXTRACT COORDINATES =====
        coordinates = []
        stop_names = []
        for stop in stops:
            lat = stop.get('lat', 9.0245)
            lng = stop.get('lng', 38.7485)
            coordinates.append([lat, lng])
            stop_names.append(stop.get('name', f'Stop {len(stop_names)}'))

        print(f"📍 Stops: {stop_names}")

        # ===== GET DISTANCE MATRIX (with traffic if requested) =====
        distance_matrix = get_distance_matrix(coordinates)
        
        # Apply traffic factors if requested
        if include_traffic and len(coordinates) > 1:
            traffic_factors = []
            for i in range(len(coordinates)):
                for j in range(len(coordinates)):
                    if i != j:
                        factor = get_traffic_factor(
                            coordinates[i][0], coordinates[i][1],
                            coordinates[j][0], coordinates[j][1]
                        )
                        distance_matrix[i][j] *= factor
            print("📊 Applied traffic factors")

        print(f"📊 Distance matrix calculated")

        # ===== SOLVE VRP =====
        optimized_order, vehicle_routes, raw_routes = solve_vrp(
            distance_matrix, num_vehicles, depot_index,
            depot_indices=depot_indices,
            max_stops_per_vehicle=max_stops_per_vehicle,
            time_windows=time_windows
        )
        print(f"✅ Optimized order: {optimized_order}")

        # ===== CALCULATE DISTANCES =====
        total_distance = 0
        per_vehicle_distances = []
        for route in raw_routes:
            route_distance = 0
            if len(route) > 1:
                for i in range(len(route) - 1):
                    route_distance += distance_matrix[route[i]][route[i+1]]
            total_distance += route_distance
            per_vehicle_distances.append(round(route_distance, 2))

        original_distance = 0
        for i in range(len(stops) - 1):
            original_distance += distance_matrix[i][i+1]

        savings = original_distance - total_distance
        savings_percent = (savings / original_distance * 100) if original_distance > 0 else 0

        # ===== GET WEATHER FACTORS =====
        weather_info = []
        if include_weather and len(coordinates) > 0:
            for i, coord in enumerate(coordinates):
                factor, condition = get_weather_factor(coord[0], coord[1])
                weather_info.append({
                    'stop_index': i,
                    'condition': condition,
                    'factor': factor
                })

        # ===== BUILD RESPONSE =====
        optimized_stops = []
        for idx in optimized_order:
            if idx < len(stops):
                stop = stops[idx].copy()
                if include_weather and idx < len(weather_info):
                    stop['weather'] = weather_info[idx]
                optimized_stops.append(stop)

        vehicle_routes_data = []
        for route in vehicle_routes:
            route_stops = []
            for node in route:
                if node < len(stops):
                    route_stops.append(stops[node])
            if route_stops:
                vehicle_routes_data.append(route_stops)

        elapsed_time = time.time() - start_time

        print(f"📊 Original: {original_distance} km, Optimized: {total_distance} km, Savings: {savings_percent}%")
        print(f"🚚 Per-vehicle distances: {per_vehicle_distances}")
        print(f"⏱️ Optimization time: {elapsed_time:.2f}s")

        return jsonify({
            'success': True,
            'optimized_stops': optimized_stops,
            'optimized_order': optimized_order,
            'vehicle_routes': vehicle_routes_data,
            'vehicle_distances': per_vehicle_distances,
            'total_distance': round(total_distance, 2),
            'original_distance': round(original_distance, 2),
            'savings': round(savings, 2),
            'savings_percent': round(savings_percent, 1),
            'time_saved': round((savings / 45) * 60, 0) if savings > 0 else 0,
            'num_stops': len(stops),
            'num_vehicles': num_vehicles,
            'optimization_time': round(elapsed_time, 2),
            'weather_info': weather_info if include_weather else [],
            'traffic_applied': include_traffic
        })

    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# ============================================================
# 🏥 HEALTH CHECK
# ============================================================

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'OK',
        'service': 'TAMYOKIY Route Optimizer',
        'version': '3.0 - WITH TRAFFIC & WEATHER',
        'features': [
            'Multi-vehicle VRP',
            'OSRM distance matrix',
            'Haversine fallback',
            'Real-time traffic factors',
            'Weather conditions',
            'Time windows support',
            'Forced multi-vehicle'
        ]
    })

# ============================================================
# 🚀 START
# ============================================================

if __name__ == '__main__':
    print("🚀 TAMYOKIY Route Optimizer Starting...")
    print("📍 Using OSRM for distances")
    print("🧠 Using OR-Tools for VRP solving")
    print("🚛 FORCED multi-vehicle support enabled!")
    print("🌤️ Weather & traffic factor support enabled!")
    print("⏰ Time window support enabled!")
    app.run(host='0.0.0.0', port=5001, debug=True)