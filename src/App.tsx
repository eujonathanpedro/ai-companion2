import { useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'

type Thread = {
  id: string
  user_id: string
  title: string
  created_at: string
  updated_at: string
}

type Message = {
  id: string
  thread_id: string
  role: string
  parts: unknown
  created_at: string
}

function getMessageText(parts: unknown) {
  if (typeof parts === 'string') return parts
  if (Array.isArray(parts)) {
    return parts
      .map((part) => {
        if (typeof part === 'string') return part
        if (part && typeof part === 'object' && 'text' in part) {
          return String(part.text)
        }
        return ''
      })
      .join('')
  }
  if (parts && typeof parts === 'object' && 'text' in parts) {
    return String(parts.text)
  }
  return ''
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [threads, setThreads] = useState<Thread[]>([])
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId),
    [threads, activeThreadId],
  )

  useEffect(() => {
    if (!supabase) {
      setError('O cliente Supabase não está configurado neste ambiente.')
      setLoading(false)
      return
    }

    let mounted = true

    const loadSession = async () => {
      const { data, error: sessionError } = await supabase.auth.getSession()
      if (!mounted) return
      if (sessionError) setError(sessionError.message)
      setUser(data.session?.user ?? null)
      setLoading(false)
    }

    loadSession()
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (!session) {
        setThreads([])
        setMessages([])
        setActiveThreadId(null)
      }
    })

    return () => {
      mounted = false
      data.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!supabase || !user) return

    const loadThreads = async () => {
      setLoading(true)
      const { data, error: threadError } = await supabase
        .from('threads')
        .select('id, user_id, title, created_at, updated_at')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })

      if (threadError) {
        setError(threadError.message)
      } else {
        setThreads((data ?? []) as Thread[])
        setActiveThreadId((current) => current ?? data?.[0]?.id ?? null)
      }
      setLoading(false)
    }

    loadThreads()
  }, [user])

  useEffect(() => {
    if (!supabase || !activeThreadId) {
      setMessages([])
      return
    }

    const loadMessages = async () => {
      const { data, error: messageError } = await supabase
        .from('messages')
        .select('id, thread_id, role, parts, created_at')
        .eq('thread_id', activeThreadId)
        .order('created_at', { ascending: true })

      if (messageError) setError(messageError.message)
      else setMessages((data ?? []) as Message[])
    }

    loadMessages()
  }, [activeThreadId])

  const createThread = async () => {
    if (!supabase || !user) return null

    const { data, error: threadError } = await supabase
      .from('threads')
      .insert({ user_id: user.id, title: 'Nova conversa' })
      .select('id, user_id, title, created_at, updated_at')
      .single()

    if (threadError) {
      setError(threadError.message)
      return null
    }

    const thread = data as Thread
    setThreads((current) => [thread, ...current])
    setActiveThreadId(thread.id)
    setMessages([])
    return thread
  }

  const sendMessage = async () => {
    const text = draft.trim()
    if (!supabase || !user || !text || sending) return

    setSending(true)
    setError('')
    let threadId = activeThreadId
    let thread = activeThread

    if (!threadId) {
      const createdThread = await createThread()
      threadId = createdThread?.id ?? null
      thread = createdThread ?? undefined
    }

    if (!threadId) {
      setSending(false)
      return
    }

    const { data, error: insertError } = await supabase
      .from('messages')
      .insert({
        thread_id: threadId,
        role: 'user',
        parts: [{ type: 'text', text }],
      })
      .select('id, thread_id, role, parts, created_at')
      .single()

    if (insertError) {
      setError(insertError.message)
    } else {
      setMessages((current) => [...current, data as Message])
      setDraft('')
      if (thread?.title === 'Nova conversa') {
        const title = text.length > 42 ? `${text.slice(0, 42)}…` : text
        await supabase.from('threads').update({ title }).eq('id', threadId)
        setThreads((current) =>
          current.map((item) => (item.id === threadId ? { ...item, title } : item)),
        )
      }
    }

    setSending(false)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      sendMessage()
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="flex items-center gap-3 text-muted-foreground">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-primary" />
          Carregando seu espaço...
        </div>
      </main>
    )
  }

  if (!user) {
    return (
      <main className="min-h-screen overflow-hidden bg-background text-foreground">
        <header className="relative z-10 border-b border-border/70">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-xl font-bold text-primary-foreground shadow-lg shadow-primary/20">✦</div>
              <div>
                <p className="font-semibold tracking-tight">Luma</p>
                <p className="text-xs text-muted-foreground">AI companion</p>
              </div>
            </div>
            <span className="hidden rounded-full border border-border bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground sm:inline-flex">
              Seu espaço para estar presente
            </span>
          </div>
        </header>

        <section className="relative isolate">
          <div className="pointer-events-none absolute -left-32 top-12 -z-10 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
          <div className="pointer-events-none absolute -right-32 top-24 -z-10 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
          <div className="mx-auto grid max-w-7xl items-center gap-14 px-6 py-20 sm:py-28 lg:grid-cols-[1.05fr_0.95fr] lg:px-10 lg:py-32">
            <div>
              <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                Uma conversa que acompanha você
              </div>
              <h1 className="max-w-3xl text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
                Um espaço para pensar, sentir e <span className="text-primary">seguir em frente.</span>
              </h1>
              <p className="mt-7 max-w-xl text-lg leading-8 text-muted-foreground sm:text-xl">
                Luma é seu AI companion para conversas acolhedoras, reflexões sinceras e pequenos momentos de clareza no seu dia.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
                <button
                  onClick={() => document.getElementById('como-funciona')?.scrollIntoView({ behavior: 'smooth' })}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:-translate-y-0.5 hover:opacity-90"
                >
                  Conhecer a Luma <span aria-hidden="true">→</span>
                </button>
                <span className="text-center text-xs text-muted-foreground sm:text-left">Privado, pessoal e sempre disponível</span>
              </div>
              {error && <p className="mt-6 max-w-md rounded-xl bg-red-400/10 px-4 py-3 text-sm text-red-300">{error}</p>}
            </div>

            <div className="relative mx-auto w-full max-w-md lg:mr-0">
              <div className="absolute -inset-5 rounded-[2.5rem] bg-primary/10 blur-2xl" />
              <div className="relative rounded-[2rem] border border-border bg-muted/30 p-4 shadow-2xl shadow-black/30 backdrop-blur-sm sm:p-5">
                <div className="rounded-[1.5rem] border border-border/80 bg-background/80 p-5 sm:p-6">
                  <div className="flex items-center justify-between border-b border-border pb-5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-xl text-primary">✦</div>
                      <div>
                        <p className="text-sm font-semibold">Luma</p>
                        <p className="text-xs text-muted-foreground">Está aqui com você</p>
                      </div>
                    </div>
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-lg shadow-emerald-400/40" />
                  </div>
                  <div className="space-y-5 py-7">
                    <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-border bg-muted/60 px-4 py-3 text-sm leading-6 text-muted-foreground">
                      O que está ocupando seus pensamentos hoje?
                    </div>
                    <div className="ml-auto max-w-[78%] rounded-2xl rounded-br-md bg-primary px-4 py-3 text-sm leading-6 text-primary-foreground">
                      Preciso organizar algumas coisas e respirar um pouco.
                    </div>
                    <div className="max-w-[88%] rounded-2xl rounded-bl-md border border-border bg-muted/60 px-4 py-3 text-sm leading-6 text-muted-foreground">
                      Vamos com calma. Podemos começar pelo que parece mais importante agora.
                    </div>
                  </div>
                  <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                    <span className="flex-1">Escreva uma mensagem...</span>
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-base font-bold text-primary-foreground">↑</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="como-funciona" className="border-t border-border/70 bg-muted/10">
          <div className="mx-auto max-w-7xl px-6 py-20 lg:px-10 lg:py-24">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Feito para o seu ritmo</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Mais do que respostas. Um lugar para você.</h2>
              <p className="mt-4 text-base leading-7 text-muted-foreground">Tenha conversas que ajudam a transformar pensamentos soltos em próximos passos possíveis.</p>
            </div>
            <div className="mt-12 grid gap-5 md:grid-cols-3">
              <article className="rounded-2xl border border-border bg-background/60 p-6">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-xl text-primary">◌</div>
                <h3 className="mt-6 text-lg font-semibold">Converse sem julgamentos</h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">Coloque para fora o que você está vivendo e encontre um espaço de escuta disponível quando precisar.</p>
              </article>
              <article className="rounded-2xl border border-border bg-background/60 p-6">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-xl text-primary">✧</div>
                <h3 className="mt-6 text-lg font-semibold">Organize suas ideias</h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">Retome suas conversas e transforme reflexões em clareza, decisões e pequenas ações.</p>
              </article>
              <article className="rounded-2xl border border-border bg-background/60 p-6">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-xl text-primary">⌁</div>
                <h3 className="mt-6 text-lg font-semibold">Continue de onde parou</h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">Cada conversa fica no seu espaço pessoal para que sua jornada tenha continuidade.</p>
              </article>
            </div>
          </div>
        </section>

        <footer className="border-t border-border/70 px-6 py-8 lg:px-10">
          <div className="mx-auto flex max-w-7xl flex-col gap-2 text-center text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:text-left">
            <span>Seu espaço começa com uma conversa.</span>
            <span>Luma · AI companion</span>
          </div>
        </footer>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen bg-background text-foreground">
      <aside className="hidden w-80 shrink-0 border-r border-border bg-muted/10 md:flex md:flex-col">
        <div className="flex items-center gap-3 border-b border-border px-6 py-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-xl font-bold text-primary-foreground">✦</div>
          <div>
            <p className="font-semibold tracking-tight">Luma</p>
            <p className="text-xs text-muted-foreground">AI companion</p>
          </div>
        </div>
        <div className="p-4">
          <button
            onClick={createThread}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
          >
            <span className="text-lg leading-none">+</span> Nova conversa
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-4">
          <p className="px-3 pb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Suas conversas</p>
          {threads.length === 0 ? (
            <p className="px-3 text-sm leading-6 text-muted-foreground">Suas conversas aparecerão aqui.</p>
          ) : (
            <div className="space-y-1">
              {threads.map((thread) => (
                <button
                  key={thread.id}
                  onClick={() => setActiveThreadId(thread.id)}
                  className={`w-full rounded-xl px-3 py-3 text-left text-sm transition ${activeThreadId === thread.id ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
                >
                  <span className="block truncate">{thread.title}</span>
                  <span className="mt-1 block text-xs opacity-60">{formatTime(thread.updated_at)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="border-t border-border p-4">
          <div className="flex items-center gap-3 rounded-xl bg-muted/50 p-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-primary">{(user.email?.[0] ?? 'U').toUpperCase()}</div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">Sua conta</p>
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            </div>
          </div>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary md:hidden">✦</div>
            <div>
              <h1 className="font-semibold">{activeThread?.title ?? 'Nova conversa'}</h1>
              <p className="text-xs text-muted-foreground">Sempre aqui para você</p>
            </div>
          </div>
          <button onClick={createThread} className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground md:hidden">+ Nova</button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-8 sm:px-8">
          <div className="mx-auto flex max-w-3xl flex-col gap-6">
            {messages.length === 0 ? (
              <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/10 text-3xl text-primary">✦</div>
                <h2 className="mt-6 text-2xl font-semibold">Olá, {user.email?.split('@')[0]}.</h2>
                <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">O que está passando pela sua cabeça hoje?</p>
              </div>
            ) : (
              messages.map((message) => (
                <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === 'user' ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md border border-border bg-muted/60 text-foreground'}`}>
                    <p className="whitespace-pre-wrap">{getMessageText(message.parts)}</p>
                    <p className={`mt-2 text-[10px] ${message.role === 'user' ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>{formatTime(message.created_at)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="px-5 pb-5 pt-2 sm:px-8 sm:pb-8">
          <div className="mx-auto max-w-3xl">
            {error && <p className="mb-3 text-center text-xs text-red-300">{error}</p>}
            <div className="flex items-end gap-3 rounded-2xl border border-border bg-muted/30 p-2 shadow-lg shadow-black/10 focus-within:border-primary/60">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                placeholder="Escreva uma mensagem..."
                className="max-h-32 min-h-11 flex-1 resize-none bg-transparent px-3 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
              <button onClick={sendMessage} disabled={!draft.trim() || sending} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Enviar mensagem">↑</button>
            </div>
            <p className="mt-3 text-center text-[11px] text-muted-foreground">Pressione Enter para enviar · Shift + Enter para nova linha</p>
          </div>
        </div>
      </section>
    </main>
  )
}

export default App
