/* Toast host + useToast() hook — dark ink pills, bottom-centred, 2.6s. */
import React, { useState, useCallback } from "react";
import { Icon } from "./Icon";

const ToastCtx = React.createContext<(msg: string, icon?: string) => void>(() => {});
export const useToast = () => React.useContext(ToastCtx);

export function ToastHost({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<any[]>([]);
  const push = useCallback((msg: string, icon?: string) => {
    const id = Math.random().toString(36).slice(2);
    setItems((s) => [...s, { id, msg, icon }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 2600);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-host">
        {items.map((t) => (
          <div className="toast" key={t.id}>
            {t.icon && <Icon name={t.icon} size={16} />}
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
