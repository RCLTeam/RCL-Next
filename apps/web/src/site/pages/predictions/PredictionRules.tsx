import React from 'react';
export function PredictionRules() {
  return (
    <div className="prediction-rules">
      <div>
        <b>+1</b>
        <span>Acierta el ganador</span>
      </div>
      <div>
        <b>+3</b>
        <span>Acierta el resultado exacto</span>
        <small>3 puntos totales por serie</small>
      </div>
      <div className="prediction-schedule">
        <b>LUN → MAR</b>
        <span>Lunes 00:00 — Martes 23:59</span>
        <small>Hora de Madrid · Sin bonus por racha</small>
      </div>
    </div>
  );
}
