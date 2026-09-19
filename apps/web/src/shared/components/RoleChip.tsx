import React from 'react';

export interface RoleChipProps {
  role: string;
}

export function RoleChip({ role }: RoleChipProps) {
  return <span className="role-chip">{role}</span>;
}
