import React from 'react';

const rules = [
  ['01', 'Elige al ganador'],
  ['02', 'Predice el resultado'],
  ['03', 'Sigue tus aciertos']
] as const;

export function PredictionRules() {
  return (
    <div className="prediction-rules">
      {rules.map(([step, text]) => (
        <div key={step}>
          <b>{step}</b>
          <span>{text}</span>
        </div>
      ))}
    </div>
  );
}
