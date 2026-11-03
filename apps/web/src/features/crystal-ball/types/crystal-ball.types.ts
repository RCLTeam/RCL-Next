import type { CrystalAnswers, CrystalBallData } from '@rcl/contracts';
export interface CrystalAdminProps {
  data: CrystalBallData;
  configure: (open: string, close: string) => Promise<void>;
  resolve: (answers: CrystalAnswers, finalize: boolean) => Promise<void>;
  onDirty: (dirty: boolean) => void;
  onBusy: (busy: boolean) => void;
}
