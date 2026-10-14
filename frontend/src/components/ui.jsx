import { forwardRef, useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Loader2, Search, X, AlertTriangle, RefreshCw } from 'lucide-react'
import { initials } from '../lib/format'

export const cn = (...c) => c.filter(Boolean).join(' ')

const BTN_VARIANTS = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm shadow-brand-600/20 disabled:bg-brand-300',
  secondary: 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 hover:ring-slate-300 shadow-sm disabled:text-slate-400',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:text-slate-300',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 shadow-sm disabled:bg-rose-300',
  'danger-ghost': 'text-rose-600 hover:bg-rose-50 disabled:text-rose-300',
  subtle: 'bg-brand-50 text-brand-700 hover:bg-brand-100 disabled:text-brand-300',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm',
}
const BTN_SIZES = {
  sm: 'h-8 px-3 text-sm gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-5 text-base gap-2 rounded-xl',
}

export const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', icon: Icon, iconRight: IconRight, loading, className, children, to, type = 'button', ...props },
  ref
) {
  const cls = cn(
    'inline-flex items-center justify-center font-semibold transition-all select-none whitespace-nowrap active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
    BTN_VARIANTS[variant],
    BTN_SIZES[size],
    className
  )
  const content = (
    <>
      {loading ? <Loader2 className="size-4 shrink-0 animate-spin" /> : Icon && <Icon className={cn('shrink-0', size === 'lg' ? 'size-5' : 'size-4')} />}
      {children}
      {IconRight && <IconRight className="size-4 shrink-0" />}
    </>
  )
  if (to) return <Link ref={ref} to={to} className={cls} {...props}>{content}</Link>
  return (
    <button ref={ref} type={type} className={cls} disabled={loading || props.disabled} {...props}>
      {content}
    </button>
  )
})

export function IconButton({ icon: Icon, label, className, variant = 'ghost', size = 'md', ...props }) {
  const s = size === 'sm' ? 'size-8' : 'size-10'
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={cn('inline-flex items-center justify-center rounded-xl transition-colors shrink-0', s, BTN_VARIANTS[variant], className)}
      {...props}
    >
      <Icon className="size-[18px]" />
    </button>
  )
}

const inputBase =
  'w-full rounded-xl border-0 bg-white px-3.5 text-[15px] text-slate-900 ring-1 ring-slate-200 placeholder:text-slate-400 shadow-sm transition focus:ring-2 focus:ring-brand-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500'

export const Input = forwardRef(function Input({ className, error, ...props }, ref) {
  return <input ref={ref} className={cn(inputBase, 'h-11', error && 'ring-rose-400', className)} {...props} />
})

export const Textarea = forwardRef(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(inputBase, 'py-2.5 min-h-24', className)} {...props} />
})

export const Select = forwardRef(function Select({ className, children, ...props }, ref) {
  return (
    <select
      ref={ref}
      className={cn(
        inputBase,
        'h-11 appearance-none pr-10 bg-[url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%2394a3b8%22%3E%3Cpath%20d%3D%22M5.3%207.3a1%201%200%20011.4%200L10%2010.6l3.3-3.3a1%201%200%20111.4%201.4l-4%204a1%201%200%2001-1.4%200l-4-4a1%201%200%20010-1.4z%22/%3E%3C/svg%3E")] bg-[length:20px] bg-[right_12px_center] bg-no-repeat',
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
})

export function Field({ label, hint, error, children, className, htmlFor, optional }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
          {label} {optional && <span className="font-normal text-slate-400">(opcional)</span>}
        </label>
      )}
      {children}
      {error ? <p className="text-sm text-rose-600">{error}</p> : hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
    </div>
  )
}

export function Toggle({ checked, onChange, disabled, label, description, size = 'md', className }) {
  const id = useId()
  const sw = (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={!!checked}
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); onChange?.(!checked) }}
      className={cn(
        'relative inline-flex shrink-0 items-center rounded-full transition-colors disabled:opacity-50',
        size === 'sm' ? 'h-5 w-9' : 'h-7 w-12',
        checked ? 'bg-emerald-500' : 'bg-slate-300'
      )}
    >
      <span
        className={cn(
          'inline-block rounded-full bg-white shadow transition-transform',
          size === 'sm' ? 'size-4' : 'size-6',
          checked ? (size === 'sm' ? 'translate-x-[18px]' : 'translate-x-[22px]') : 'translate-x-0.5'
        )}
      />
    </button>
  )
  if (!label) return sw
  return (
    <label htmlFor={id} className={cn('flex items-center justify-between gap-4 cursor-pointer', className)}>
      <span>
        <span className="block text-sm font-medium text-slate-800">{label}</span>
        {description && <span className="block text-xs text-slate-500 mt-0.5">{description}</span>}
      </span>
      {sw}
    </label>
  )
}

export function Card({ className, children, padded = true, ...props }) {
  return (
    <div className={cn('rounded-2xl bg-white ring-1 ring-slate-200/70 shadow-sm', padded && 'p-4 sm:p-5', className)} {...props}>
      {children}
    </div>
  )
}

export function CardTitle({ children, action, className, icon: Icon }) {
  return (
    <div className={cn('flex items-center justify-between gap-3 mb-4', className)}>
      <h3 className="font-semibold text-slate-900 flex items-center gap-2">
        {Icon && <Icon className="size-[18px] text-slate-400" />}
        {children}
      </h3>
      {action}
    </div>
  )
}

const BADGE_COLORS = {
  slate: 'bg-slate-100 text-slate-700',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  red: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  amber: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  brand: 'bg-brand-50 text-brand-700 ring-brand-600/20',
  sky: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  purple: 'bg-purple-50 text-purple-700 ring-purple-600/20',
}

export function Badge({ color = 'slate', className, children, dot }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ring-transparent whitespace-nowrap', BADGE_COLORS[color], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

export function OnlineBadge({ online, active = true, paired = true }) {
  if (!paired) return <Badge color="amber" dot>Aguardando instalação</Badge>
  if (!active) return <Badge color="slate" dot>Desativada</Badge>
  return online ? (
    <Badge color="green" className="[&>span]:animate-pulse" dot>Online</Badge>
  ) : (
    <Badge color="red" dot>Offline</Badge>
  )
}

export function Spinner({ className }) {
  return <Loader2 className={cn('size-5 animate-spin text-brand-600', className)} />
}

export function PageLoader() {
  return (
    <div className="flex h-64 items-center justify-center">
      <Spinner className="size-7" />
    </div>
  )
}

export function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center py-12 px-6', className)}>
      {Icon && (
        <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-50 to-purple-50 ring-1 ring-brand-100">
          <Icon className="size-8 text-brand-500" />
        </div>
      )}
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function ErrorState({ error, onRetry }) {
  return (
    <EmptyState
      icon={AlertTriangle}
      title="Não foi possível carregar"
      description={error?.message || 'Tente novamente em instantes.'}
      action={onRetry && <Button variant="secondary" icon={RefreshCw} onClick={onRetry}>Tentar novamente</Button>}
    />
  )
}

export function PageHeader({ title, description, actions, back, children }) {
  const navigate = useNavigate()
  return (
    <div className="mb-5 sm:mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          {back && (
            <IconButton icon={ArrowLeft} label="Voltar" className="-ml-2 mt-[-2px]" onClick={() => (typeof back === 'string' ? navigate(back) : navigate(-1))} />
          )}
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 truncate">{title}</h1>
            {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
      </div>
      {children}
    </div>
  )
}

export function Tabs({ tabs, value, onChange, className }) {
  return (
    <div className={cn('flex gap-1 overflow-x-auto no-scrollbar rounded-xl bg-slate-100 p-1', className)}>
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          className={cn(
            'flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition',
            value === t.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
          )}
        >
          {t.icon && <t.icon className="size-4" />}
          {t.label}
          {t.count != null && <span className="text-xs text-slate-400">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

const AVATAR_COLORS = ['bg-brand-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-sky-500', 'bg-purple-500', 'bg-teal-500']
export function Avatar({ name, src, size = 'md', className }) {
  const s = { sm: 'size-7 text-xs', md: 'size-9 text-sm', lg: 'size-12 text-base' }[size]
  const color = AVATAR_COLORS[(name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length]
  if (src) return <img src={src} alt="" className={cn('rounded-full object-cover', s, className)} />
  return <span className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white', color, s, className)}>{initials(name)}</span>
}

export function SearchInput({ value, onChange, placeholder = 'Buscar…', className }) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pl-9 h-10" />
    </div>
  )
}

export function Segmented({ options, value, onChange, className }) {
  return (
    <div className={cn('inline-flex rounded-xl bg-slate-100 p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition whitespace-nowrap',
            value === o.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
          )}
        >
          {o.icon && <o.icon className="size-4" />}
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Modal({ open, onClose, title, description, children, footer, size = 'md', dismissable = true }) {
  const panelRef = useRef(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && dismissable && onClose?.()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose, dismissable])
  if (!open) return null
  const width = { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl', full: 'sm:max-w-6xl' }[size]
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px] animate-fade-in" onClick={() => dismissable && onClose?.()} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative flex w-full flex-col bg-white shadow-2xl animate-slide-up sm:animate-pop',
          'max-h-[92dvh] rounded-t-3xl sm:rounded-2xl',
          width
        )}
      >
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-slate-200 sm:hidden" />
        {(title || dismissable) && (
          <div className="flex items-start justify-between gap-4 px-5 pt-4 sm:pt-5 pb-3">
            <div className="min-w-0">
              {title && <h2 className="text-lg font-semibold text-slate-900">{title}</h2>}
              {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
            </div>
            {dismissable && <IconButton icon={X} label="Fechar" size="sm" className="-mr-1.5 -mt-0.5" onClick={onClose} />}
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-5 pb-5 scrollbar-thin">{children}</div>
        {footer && <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 border-t border-slate-100 px-5 py-4 safe-bottom">{footer}</div>}
      </div>
    </div>,
    document.body
  )
}

export function Stat({ label, value, icon: Icon, color = 'brand', hint, to }) {
  const colors = {
    brand: 'from-brand-500 to-purple-500',
    green: 'from-emerald-500 to-teal-500',
    amber: 'from-amber-500 to-orange-500',
    sky: 'from-sky-500 to-cyan-500',
    rose: 'from-rose-500 to-pink-500',
  }
  const inner = (
    <Card className="h-full transition hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-slate-500 truncate">{label}</p>
          <p className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">{value}</p>
          {hint && <p className="mt-0.5 text-xs text-slate-500 truncate">{hint}</p>}
        </div>
        {Icon && (
          <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm', colors[color])}>
            <Icon className="size-5" />
          </div>
        )}
      </div>
    </Card>
  )
  return to ? <Link to={to} className="block">{inner}</Link> : inner
}

export function ProgressBar({ value, className, color = 'bg-brand-500' }) {
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-slate-100', className)}>
      <div className={cn('h-full rounded-full transition-all', value > 0.9 ? 'bg-rose-500' : color)} style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
    </div>
  )
}

export function ColorPicker({ value, onChange, colors }) {
  const list = colors || ['#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#eab308', '#22c55e', '#10b981', '#06b6d4', '#3b82f6', '#64748b', '#0f172a']
  return (
    <div className="flex flex-wrap gap-2">
      {list.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={cn('size-8 rounded-full ring-offset-2 transition', value === c ? 'ring-2 ring-slate-900 scale-110' : 'hover:scale-110')}
          style={{ background: c }}
          aria-label={c}
        />
      ))}
    </div>
  )
}
