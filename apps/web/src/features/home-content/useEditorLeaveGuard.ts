import { useEffect } from 'react';
import { useNavigation } from '../../shared/navigation.js';

export function editorLeaveHandlers(dirty: boolean, busy: boolean) {
  return {
    canLeave() {
      if (busy) return false;
      return !dirty || window.confirm('Hay cambios sin guardar. ¿Quieres descartarlos?');
    },
    beforeUnload(event: BeforeUnloadEvent) {
      if (!dirty && !busy) return;
      event.preventDefault();
      event.returnValue = '';
    }
  };
}

export function useEditorLeaveGuard(dirty: boolean, busy: boolean) {
  const { setLeaveGuard } = useNavigation();
  useEffect(() => {
    const { canLeave, beforeUnload } = editorLeaveHandlers(dirty, busy);
    setLeaveGuard?.(canLeave);
    if (dirty || busy) window.addEventListener('beforeunload', beforeUnload);
    return () => {
      setLeaveGuard?.(null);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [dirty, busy, setLeaveGuard]);
}
