import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Link2, RefreshCw, KeyRound, Clock, Ban } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatDateTime } from '../lib/format'
import { useConfirm, useToast } from './feedback'
import { Button, Modal, PageLoader } from './ui'
import { ShareLink } from './InviteModal'

/** Link + instruções para o técnico instalar a TV sem digitar código. */
export function InstallLinkPanel({ screen, install }) {
  const message = `Instalação da TV "${screen.name}"${screen.location ? ` (${screen.location})` : ''}: abra este link no navegador da TV e ela se conecta sozinha:\n${install.link}`
  return (
    <div className="space-y-4">
      <ol className="space-y-2 text-sm text-slate-600">
        {[
          'Envie o link para quem vai instalar (pelo WhatsApp, por exemplo).',
          <>A pessoa abre o link <b>no navegador da TV</b> (ou digita o endereço).</>,
          'A TV se conecta sozinha e já começa a exibir a programação.',
        ].map((text, i) => (
          <li key={i} className="flex gap-2">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">{i + 1}</span>
            <span>{text}</span>
          </li>
        ))}
      </ol>
      <ShareLink link={install.link} message={message} subject={`Instalação da TV ${screen.name}`} />
      <p className="flex items-center gap-1.5 text-xs text-slate-500">
        <Clock className="size-3.5" />Vale para uma única instalação, até {formatDateTime(install.expires_at)}.
      </p>
    </div>
  )
}

export default function InstallLinkModal({ open, onClose, screen, onChanged }) {
  const { orgId } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const [install, setInstall] = useState(null)
  const [loading, setLoading] = useState(false)

  const generate = async () => {
    setLoading(true)
    try {
      const d = await api.post(`orgs/${orgId}/screens/${screen.id}/install-link`)
      setInstall(d.install)
      onChanged?.()
    } catch (e) {
      toast.error(e)
      onClose()
    } finally {
      setLoading(false)
    }
  }

  // O servidor guarda só o hash do link, então ele não pode ser exibido de novo.
  // Se já existe um link ativo (talvez já enviado ao técnico), não gera outro sem confirmação.
  useEffect(() => {
    if (!open) return
    setInstall(null)
    if (!screen.install_link_active) generate()
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const revoke = async () => {
    try {
      await api.del(`orgs/${orgId}/screens/${screen.id}/install-link`)
      toast.success('Link de instalação cancelado')
      onChanged?.()
      onClose()
    } catch (e) {
      toast.error(e)
    }
  }

  const regenerate = async () => {
    if (await confirm({ title: 'Gerar outro link?', message: 'O link enviado antes deixará de funcionar.', confirmLabel: 'Gerar novo link' })) generate()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={<span className="flex items-center gap-2"><Link2 className="size-5 text-brand-600" />Link de instalação</span>}
      description={screen.paired ? `Use para conectar um aparelho novo a "${screen.name}". O aparelho atual será desconectado quando o link for usado.` : `Para instalar "${screen.name}" sem precisar de código.`}
      footer={install && (
        <>
          <Button variant="danger-ghost" icon={Ban} onClick={revoke} className="sm:mr-auto">Cancelar link</Button>
          <Button variant="secondary" icon={RefreshCw} onClick={regenerate}>Gerar outro</Button>
          <Button onClick={onClose}>Concluir</Button>
        </>
      )}
    >
      {!install && !loading && screen.install_link_active ? (
        <div className="space-y-4">
          <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
            Já existe um link de instalação ativo para esta TV, válido até <b>{formatDateTime(screen.install_expires_at)}</b>.
            Por segurança ele não pode ser exibido de novo. Se você ainda tem o link, pode usá-lo normalmente;
            se gerar um novo, o anterior para de funcionar.
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button icon={RefreshCw} onClick={generate}>Gerar novo link</Button>
            <Button variant="danger-ghost" icon={Ban} onClick={revoke}>Cancelar link</Button>
          </div>
        </div>
      ) : loading || !install ? <PageLoader /> : (
        <div className="space-y-5">
          <InstallLinkPanel screen={screen} install={install} />
          <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600 ring-1 ring-slate-200">
            Prefere usar o código? Abra <b>/tv</b> na TV e{' '}
            <button type="button" className="inline-flex items-center gap-1 font-semibold text-brand-600" onClick={() => { onClose(); navigate(`/tvs/adicionar?replace=${screen.id}`) }}>
              <KeyRound className="size-3.5" />digite o código aqui
            </button>.
          </div>
        </div>
      )}
    </Modal>
  )
}
