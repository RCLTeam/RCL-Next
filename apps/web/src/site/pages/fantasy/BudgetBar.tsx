import React from 'react';

export function BudgetBar() {
  return (
    <div className="budget-bar">
      <div>
        <span className="eyebrow">Construye tu quinteto</span>
        <p>Elige tu estrategia y sigue a tus jugadores favoritos.</p>
      </div>
      <div className="budget-stats">
        <div>
          <strong>100</strong>
          <span>Fichas de presupuesto</span>
        </div>
        <div>
          <strong>5</strong>
          <span>Roles en tu quinteto</span>
        </div>
      </div>
    </div>
  );
}
