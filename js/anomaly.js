// js/anomaly.js
// Client-side anomaly functions

/**
 * 📊 Load Anomaly Scoreboard
 */
async function loadDriverScoreboard() {
    const token = localStorage.getItem('token');
    if (!token) return;
    
    try {
        const res = await fetch('http://localhost:5000/api/anomaly', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        
        // Group by driver
        const driverStats = {};
        data.anomalies.forEach(a => {
            if (a.driverId) {
                const key = a.driverId._id || a.driverId;
                if (!driverStats[key]) {
                    driverStats[key] = {
                        name: a.driverName || 'Unknown',
                        count: 0,
                        totalScore: 0,
                        critical: 0,
                        high: 0
                    };
                }
                driverStats[key].count++;
                driverStats[key].totalScore += a.score || 0;
                if (a.severity === 'critical') driverStats[key].critical++;
                if (a.severity === 'high') driverStats[key].high++;
            }
        });
        
        // Sort by count
        const sorted = Object.values(driverStats)
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);
        
        const container = document.getElementById('driverScoreboard');
        if (!container) return;
        
        if (sorted.length === 0) {
            container.innerHTML = '<p style="color:#888; text-align:center; padding:20px;">No anomalies found</p>';
            return;
        }
        
        container.innerHTML = sorted.map((d, i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`;
            const avg = Math.round(d.totalScore / d.count);
            const riskColor = avg > 70 ? '#ff6b6b' : avg > 50 ? '#ffa500' : '#4caf50';
            
            return `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; border-bottom:1px solid rgba(255,255,255,0.03);">
                    <div>
                        <span style="font-weight:700; width:30px; display:inline-block;">${medal}</span>
                        <span style="color:#e0e0e0;">${d.name}</span>
                    </div>
                    <div>
                        <span style="color:${riskColor}; font-weight:600;">${d.count} anomalies</span>
                        <span style="color:#888; font-size:0.7rem; margin-left:10px;">
                            🔴 ${d.critical} ⚠️ ${d.high}
                        </span>
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (err) {
        console.error('Scoreboard error:', err);
    }
}

/**
 * 📊 Load AI Risk Prediction
 */
async function loadRiskPrediction() {
    const token = localStorage.getItem('token');
    if (!token) return;
    
    try {
        const res = await fetch('http://localhost:5000/api/anomaly/types/stats', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        
        if (!data.success) return;
        
        const dailyTrend = data.data.dailyTrend || [];
        const avgDaily = dailyTrend.length > 0 
            ? dailyTrend.reduce((sum, d) => sum + d.count, 0) / dailyTrend.length 
            : 0;
        
        const predicted = Math.round(avgDaily * 7);
        const riskLevel = predicted > 10 ? '🔴 HIGH RISK' : 
                         predicted > 5 ? '🟡 MEDIUM RISK' : 
                         '🟢 LOW RISK';
        const riskColor = predicted > 10 ? '#ff6b6b' : 
                         predicted > 5 ? '#ffa500' : 
                         '#4caf50';
        
        document.getElementById('predictedRisk').textContent = riskLevel;
        document.getElementById('predictedRisk').style.color = riskColor;
        
        // Render prediction chart
        renderRiskChart(dailyTrend);
        
    } catch (err) {
        console.error('Risk prediction error:', err);
    }
}

/**
 * 📊 Render Risk Prediction Chart
 */
function renderRiskChart(trendData) {
    const canvas = document.getElementById('riskPredictionChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    // Get last 30 days
    const last30 = trendData.slice(-30);
    const labels = last30.map(d => d._id || '');
    const values = last30.map(d => d.count || 0);
    
    // Add predictions (next 7 days)
    const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    const predictions = Array(7).fill(Math.round(avg * 1.1));
    
    // Combine
    const allLabels = [...labels, ...Array(7).fill('🔮')];
    const allValues = [...values, ...predictions];
    
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: allLabels,
            datasets: [{
                label: 'Daily Anomalies',
                data: allValues,
                borderColor: '#D4AF37',
                backgroundColor: 'rgba(212,175,55,0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: (context) => {
                    const index = context.dataIndex;
                    return index >= values.length ? 6 : 3;
                },
                pointBackgroundColor: (context) => {
                    const index = context.dataIndex;
                    return index >= values.length ? '#4caf50' : '#D4AF37';
                },
                borderDash: (context) => {
                    const index = context.dataIndex;
                    return index >= values.length ? [5, 5] : [];
                }
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: '#e0e0e0', font: { size: 10 } }
                }
            },
            scales: {
                y: {
                    ticks: { color: '#e0e0e0', stepSize: 1 },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                },
                x: {
                    ticks: { color: '#e0e0e0', font: { size: 8 }, maxTicksLimit: 15 },
                    grid: { display: false }
                }
            }
        }
    });
}

// Load when page loads
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => {
        loadDriverScoreboard();
        loadRiskPrediction();
    }, 1000);
});