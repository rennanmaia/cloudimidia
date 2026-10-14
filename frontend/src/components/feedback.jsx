import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, XCircle, Info, AlertTriangle } from 'lucide-react'
import { Button, Modal, cn } from './ui'

const ToastCtx = createContext(null)
const ConfirmCtx = createContext(null)

export function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const [confirmState, setConfirmState] = useState(null)
  const idRef = useRef(0)

  const push = useCallback((type, message) => {
    const id = ++idRef.current
    setToasts((t) => [...t.slice(-3), { id, type, message }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), type === 'error' ? 5500 : 3500)
  }, [])

  const toast = useMemo(() => ({
    success: (m) => push('success', m),
    error: (m) => push('error', typeof m === 'string' ? m : m?.message || 'Algo deu errado.'),
    info: (m) => push('info', m),
  }), [push])

  const confirm = useCallback(
    (opts) => new Promise((resolve) => setConfirmState({ ...opts, resolve })),
    []
  )

  const close = (value) => {
    confirmState?.resolve(value)
    setConfirmState(null)
  }

  const icons = { success: CheckCircle2, error: XCircle, info: Info }
  return (
    <ToastCtx.Provider value={toast}>
      <ConfirmCtx.Provider value={confirm}>
        {children}
        {createPortal(
          <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4 sm:top-auto sm:bottom-6 sm:right-6 sm:left-auto sm:items-end">
            {toasts.map((t) => {
              const Icon = icons[t.type]
              return (
                <div
                  key={t.id}
                  className={cn(
                    'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl px-4 py-3 text-sm font-medium shadow-lg ring-1 animate-slide-up',
                    t.type === 'success' && 'bg-slate-900 text-white ring-slate-800',
                    t.type === 'error' && 'bg-rose-600 text-white ring-rose-700',
                    t.type === 'info' && 'bg-white text-slate-800 ring-slate-200'
                  )}
                >
                  <Icon className={cn('size-5 shrink-0', t.type === 'success' && 'text-emerald-400')} />
                  <span>{t.message}</span>
                </div>
              )
            })}
          </div>,
          document.body
        )}
        <Modal
          open={!!confirmState}
          onClose={() => close(false)}
          size="sm"
          title={
            confirmState && (
              <span className="flex items-center gap-2">
                {confirmState.danger && <AlertTriangle className="size-5 text-rose-500" />}
                {confirmState.title || 'Confirmar'}
              </span>
            )
          }
          footer={
            <>
              <Button variant="secondary" onClick={() => close(false)}>{confirmState?.cancelLabel || 'Cancelar'}</Button>
              <Button variant={confirmState?.danger ? 'danger' : 'primary'} onClick={() => close(true)}>
                {confirmState?.confirmLabel || 'Confirmar'}
              </Button>
            </>
          }
        >
          <p className="text-sm text-slate-600">{confirmState?.message}</p>
        </Modal>
      </ConfirmCtx.Provider>
    </ToastCtx.Provider>
  )
}

export const useToast = () => useContext(ToastCtx)
export const useConfirm = () => useContext(ConfirmCtx)
