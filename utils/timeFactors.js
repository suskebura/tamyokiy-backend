// utils/timeFactors.js
// FREE - No API needed! Uses local time calculations

/**
 * Get time-of-day and day-of-week factors that affect delivery speed
 * 
 * @returns {{
*   timeFactor: number,
*   timeLabel: string,
*   hour: number,
*   day: number,
*   isWeekend: boolean,
*   isRushHour: boolean
* }}
*/

function getTimeFactors() {
   const now = new Date();
   const hour = now.getHours();
   const day = now.getDay(); // 0 = Sunday, 6 = Saturday
   
   let timeFactor = 1.0;
   let timeLabel = 'Normal';
   let isRushHour = false;

   // Rush hour factors (based on typical traffic patterns)
   if (hour >= 7 && hour <= 9) {
       timeFactor = 1.4;
       timeLabel = 'Morning Rush 🚗';
       isRushHour = true;
   } else if (hour >= 16 && hour <= 19) {
       timeFactor = 1.5;
       timeLabel = 'Evening Rush 🚗';
       isRushHour = true;
   } else if (hour >= 22 || hour <= 5) {
       timeFactor = 0.8;
       timeLabel = 'Night 🌙';
   } else if (hour >= 12 && hour <= 13) {
       timeFactor = 1.1;
       timeLabel = 'Lunch Time 🍽️';
   } else if (hour >= 10 && hour <= 11) {
       timeFactor = 1.0;
       timeLabel = 'Mid-Morning ☀️';
   } else if (hour >= 14 && hour <= 15) {
       timeFactor = 1.0;
       timeLabel = 'Afternoon 🌤️';
   } else if (hour >= 20 && hour <= 21) {
       timeFactor = 0.9;
       timeLabel = 'Evening 🌆';
   }

   // Weekend factor (less traffic, but also less staff)
   const isWeekend = (day === 0 || day === 6);
   if (isWeekend) {
       timeFactor *= 0.85;
       timeLabel += ' (Weekend)';
   }

   return {
       timeFactor: Math.round(timeFactor * 100) / 100,
       timeLabel,
       hour,
       day,
       isWeekend,
       isRushHour
   };
}

module.exports = { getTimeFactors };