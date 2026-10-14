import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Package, Upload, Trash2, Download, Smartphone, CheckCircle2 } from 'lucide-react'
import { api, uploadChunked } from '../lib/api'
import { useFetch } from '../lib/hooks'
import { formatBytes, formatDateTime } from '../lib/format'
import { useConfirm, useToast } from '../components/feedback'
import { Badge, Button, Card, CardTitle, Field, Input, PageLoader, ProgressBar, Textarea } from '../components/ui'
import { ShareLink } from '../components/InviteModal'

/** Publicação de versões do app CloudiMídia Player (Android). */
export default function AppReleases() {
  const toast = useToast()
  const confirm = useConfirm()
  const { data, loading, reload } = useFetch('admin/releases')
  const [qr, setQr] = useState(null)
  const [file, setFile] = useState(null)
  const [form, setForm] = useState({ version_name: '', version_code: '', notes: '' })
  const [progress, setProgress] = useState(null)

  useEffect(() => {
    if (data?.download_url) QRCode.toDataURL(data.download_url, { margin: 1, width: 220 }).then(setQr)
    if (data && !form.version_code) {
      const next = (data.releases[0]?.version_code || 0) + 1
      setForm((f) => ({ ...f, version_code: String(next) }))
    }
  }, [data]) // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e) => {
    e.preventDefault()
    if (!file) return toast.error('Escolha o arquivo .apk')
    setProgress(0)
    try {
      await uploadChunked(null, file, { endpoint: 'admin/releases/upload', meta: form, onProgress: setProgress, chunkSize: 8 * 1024 * 1024 }).promise
      toast.success(`Versão ${form.version_name} publicada. As TVs atualizam sozinhas em até 6 horas (ou pelo comando "Atualizar app").`)
      setFile(null)
      setForm({ version_name: '', version_code: '', notes: '' })
      reload(true)
    } catch (err) {
      toast.error(err)
    } finally {
      setProgress(null)
    }
  }

  const remove = async (r) => {
    if (!(await confirm({ title: `Excluir a versão ${r.version_name}?`, message: 'TVs que já estão nesta versão continuam funcionando.', danger: true, confirmLabel: 'Excluir' }))) return
    try {
      await api.del(`admin/releases/${r.id}`)
      reload(true)
    } catch (e) {
      toast.error(e)
    }
  }

  if (loading && !data) return <PageLoader />
  const latest = data.releases[0]
  const installs = Object.fromEntries((data.installs || []).map((i) => [i.version_code, i.screens]))

  return (
    <div className="grid gap-5 lg:grid-cols-5">
      <div className="space-y-5 lg:col-span-3">
        <Card>
          <CardTitle icon={Upload}>Publicar nova versão</CardTitle>
          <form onSubmit={submit} className="space-y-4">
            <Field label="Arquivo do app (.apk)" hint="Gerado com app/build-apk.cmd — fica em app/android/app/build/outputs/apk/release/app-release.apk">
              <Input type="file" accept=".apk,application/vnd.android.package-archive" onChange={(e) => setFile(e.target.files[0] || null)} className="py-2 h-auto file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-700" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Versão (nome)" hint="Ex.: 1.0.1"><Input required value={form.version_name} onChange={(e) => setForm({ ...form, version_name: e.target.value })} placeholder="1.0.1" /></Field>
              <Field label="Número da versão" hint="versionCode do app; sempre maior que o anterior"><Input required type="number" min={1} value={form.version_code} onChange={(e) => setForm({ ...form, version_code: e.target.value })} /></Field>
            </div>
            <Field label="O que mudou" optional><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="min-h-20" /></Field>
            {progress != null && <ProgressBar value={progress} />}
            <Button type="submit" icon={Upload} loading={progress != null}>Publicar versão</Button>
          </form>
        </Card>

        <Card>
          <CardTitle icon={Package}>Versões publicadas</CardTitle>
          {data.releases.length === 0 ? <p className="text-sm text-slate-500">Nenhuma versão publicada ainda.</p> : (
            <ul className="divide-y divide-slate-100">
              {data.releases.map((r, i) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Package className="size-5" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-semibold text-slate-900">
                      {r.version_name} <span className="text-xs font-normal text-slate-400">#{r.version_code}</span>
                      {i === 0 && <Badge color="green">Atual</Badge>}
                    </p>
                    <p className="text-xs text-slate-500">{formatBytes(r.size_bytes)} · {formatDateTime(r.created_at)} · {installs[r.version_code] || 0} TVs nesta versão</p>
                    {r.notes && <p className="mt-1 text-sm text-slate-600">{r.notes}</p>}
                  </div>
                  <a href={r.url} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Baixar"><Download className="size-4" /></a>
                  <button type="button" onClick={() => remove(r)} className="rounded-lg p-2 text-rose-500 hover:bg-rose-50" title="Excluir"><Trash2 className="size-4" /></button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="h-fit lg:col-span-2">
        <CardTitle icon={Smartphone}>Instalar em uma TV nova</CardTitle>
        {latest ? (
          <div className="space-y-4">
            <p className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="size-4" />Link sempre aponta para a versão {latest.version_name}</p>
            <ShareLink link={data.download_url} message={`App CloudiMídia Player para TV (Android): ${data.download_url}`} subject="App CloudiMídia Player" />
            {qr && <img src={qr} alt="QR Code do download" className="mx-auto size-44 rounded-xl ring-1 ring-slate-200" />}
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-600">
              <li>No TV Box, instale o app <b>Downloader</b> (Play Store / Amazon).</li>
              <li>Abra o link acima no Downloader e permita “instalar apps desconhecidos”.</li>
              <li>Abra o <b>CloudiMídia Player</b>: aparece o código para cadastrar a TV.</li>
              <li>Segure OK por 2 segundos → <b>Usar como tela inicial</b> (ou permita abrir sozinho).</li>
            </ol>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Publique a primeira versão para gerar o link de instalação.</p>
        )}
      </Card>
    </div>
  )
}
