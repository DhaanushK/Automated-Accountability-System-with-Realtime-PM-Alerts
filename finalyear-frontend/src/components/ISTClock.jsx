import { useState, useEffect } from "react";
import "./ISTClock.css";

export default function ISTClock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Convert to IST (UTC+5:30)
  const getISTTime = () => {
    const utc = time.getTime() + (time.getTimezoneOffset() * 60000);
    const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
    return new Date(utc + istOffset);
  };

  const istTime = getISTTime();
  
  const hours = istTime.getHours();
  const minutes = istTime.getMinutes();
  const seconds = istTime.getSeconds();
  
  const hour12 = hours % 12 || 12;
  const ampm = hours >= 12 ? 'PM' : 'AM';

  // Get day and date
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                  'July', 'August', 'September', 'October', 'November', 'December'];
  
  const dayName = days[istTime.getDay()];
  const monthName = months[istTime.getMonth()];
  const date = istTime.getDate();
  const year = istTime.getFullYear();

  // Calculate angles for clock hands
  const secondAngle = (seconds * 6) - 90; // 6 degrees per second
  const minuteAngle = (minutes * 6 + seconds * 0.1) - 90; // 6 degrees per minute + smooth transition
  const hourAngle = (hour12 * 30 + minutes * 0.5) - 90; // 30 degrees per hour + smooth transition

  return (
    <div className="ist-clock-container">
      <div className="clock-header">
        <h2>
          <i className="fas fa-clock"></i>
          Indian Standard Time (IST)
        </h2>
        <p className="timezone-info">UTC +5:30</p>
      </div>

      <div className="clock-content">
        {/* Analog Clock */}
        <div className="analog-clock">
          <svg viewBox="0 0 200 200" className="clock-face">
            {/* Clock border and background */}
            <circle cx="100" cy="100" r="95" fill="white" stroke="#667eea" strokeWidth="4"/>
            
            {/* Hour markers */}
            {[...Array(12)].map((_, i) => {
              const angle = (i * 30) * (Math.PI / 180);
              const x1 = 100 + 80 * Math.cos(angle);
              const y1 = 100 + 80 * Math.sin(angle);
              const x2 = 100 + 90 * Math.cos(angle);
              const y2 = 100 + 90 * Math.sin(angle);
              return (
                <line
                  key={i}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="#333"
                  strokeWidth="2"
                />
              );
            })}

            {/* Hour numbers */}
            {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((num, i) => {
              const angle = (i * 30 - 90) * (Math.PI / 180);
              const x = 100 + 65 * Math.cos(angle);
              const y = 100 + 65 * Math.sin(angle);
              return (
                <text
                  key={num}
                  x={x}
                  y={y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize="14"
                  fontWeight="bold"
                  fill="#333"
                >
                  {num}
                </text>
              );
            })}

            {/* Center dot */}
            <circle cx="100" cy="100" r="4" fill="#333"/>

            {/* Hour hand */}
            <line
              x1="100"
              y1="100"
              x2={100 + 40 * Math.cos(hourAngle * Math.PI / 180)}
              y2={100 + 40 * Math.sin(hourAngle * Math.PI / 180)}
              stroke="#333"
              strokeWidth="6"
              strokeLinecap="round"
            />

            {/* Minute hand */}
            <line
              x1="100"
              y1="100"
              x2={100 + 60 * Math.cos(minuteAngle * Math.PI / 180)}
              y2={100 + 60 * Math.sin(minuteAngle * Math.PI / 180)}
              stroke="#667eea"
              strokeWidth="4"
              strokeLinecap="round"
            />

            {/* Second hand */}
            <line
              x1="100"
              y1="100"
              x2={100 + 70 * Math.cos(secondAngle * Math.PI / 180)}
              y2={100 + 70 * Math.sin(secondAngle * Math.PI / 180)}
              stroke="#f44336"
              strokeWidth="2"
              strokeLinecap="round"
            />

            {/* Center dot overlay */}
            <circle cx="100" cy="100" r="6" fill="#f44336"/>
            <circle cx="100" cy="100" r="3" fill="white"/>
          </svg>
        </div>

        {/* Digital Clock */}
        <div className="digital-clock">
          <div className="time-display">
            <span className="hours">{String(hour12).padStart(2, '0')}</span>
            <span className="separator">:</span>
            <span className="minutes">{String(minutes).padStart(2, '0')}</span>
            <span className="separator">:</span>
            <span className="seconds">{String(seconds).padStart(2, '0')}</span>
            <span className="period">{ampm}</span>
          </div>
          
          <div className="date-display">
            <div className="day-name">{dayName}</div>
            <div className="full-date">
              {monthName} {date}, {year}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
