import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LoaderCircle, MessageSquare, Send } from 'lucide-react';
import { Alert, Button, Card, EmptyState, PageHeader } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';
import { toast } from '@/store/toastStore';
import { ChatMessage, ConversationSummary, getConversations, getMessageContacts, getMessages, markConversationRead, MessageContact, openConversation, sendMessage } from '@/features/messaging/api';

export default function MessagesPage() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [contacts, setContacts] = useState<MessageContact[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [contactId, setContactId] = useState('');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshConversations = useCallback(async () => {
    const nextConversations = await getConversations();
    setConversations(nextConversations);
  }, []);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [nextConversations, nextContacts] = await Promise.all([getConversations(), getMessageContacts()]);
        if (!alive) return;
        setConversations(nextConversations);
        setContacts(nextContacts);
        setError(null);
      } catch {
        if (alive) setError('Could not load messages. Check your connection and retry.');
      } finally { if (alive) setLoading(false); }
    };
    void load();
    const timer = window.setInterval(() => { void load(); }, 15000);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!conversationId) { setMessages([]); return; }
    let alive = true;
    const load = async () => {
      try {
        const result = await getMessages(conversationId);
        if (!alive) return;
        setMessages(result);
        setError(null);
        await markConversationRead(conversationId);
        await refreshConversations();
      } catch {
        if (alive) setError('This conversation is unavailable or you no longer have access to it.');
      }
    };
    void load();
    const timer = window.setInterval(() => { void load(); }, 5000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [conversationId, refreshConversations]);

  const active = useMemo(() => conversations.find((c) => c.id === conversationId), [conversationId, conversations]);

  async function startNew(event: FormEvent) {
    event.preventDefault();
    if (!contactId) return;
    try {
      const id = await openConversation(contactId);
      await refreshConversations();
      navigate(`/messages/${id}`);
      setContactId('');
    } catch { toast.error('Could not open this conversation. Check the recipient’s access scope.'); }
  }

  async function submitMessage(event: FormEvent) {
    event.preventDefault();
    if (!conversationId || !draft.trim() || sending) return;
    setSending(true);
    try {
      await sendMessage(conversationId, draft.trim());
      setDraft('');
      setMessages(await getMessages(conversationId));
      await refreshConversations();
    } catch { toast.error('Message could not be sent. Your draft is still available.'); }
    finally { setSending(false); }
  }

  return <div>
    <PageHeader title="Messages" description="Private one-to-one conversations within your permitted team scope." />
    {error && <Alert tone="error" title="Messages unavailable" className="mb-4" action={<Button size="sm" variant="secondary" onClick={() => { setError(null); void refreshConversations().catch(() => setError('Could not load messages. Check your connection and retry.')); }}>Retry</Button>}>{error}</Alert>}
    <div className="grid min-h-[min(72vh,760px)] gap-4 lg:grid-cols-[19rem_minmax(0,1fr)]">
      <Card className="flex min-h-64 flex-col p-0">
        <form onSubmit={startNew} className="flex gap-2 border-b border-slate-200 p-3">
          <label className="sr-only" htmlFor="message-contact">Start a conversation</label>
          <select id="message-contact" value={contactId} onChange={(e) => setContactId(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-800" disabled={contacts.length === 0}>
            <option value="">{contacts.length ? 'Choose a person…' : 'No eligible contacts'}</option>
            {contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name} · {contact.role}</option>)}
          </select>
          <Button type="submit" size="sm" disabled={!contactId} aria-label="Start conversation"><MessageSquare className="h-4 w-4" /></Button>
        </form>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? <div className="flex justify-center p-8 text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin" /></div> : conversations.length ? <ul className="fp-stagger divide-y divide-slate-100">{conversations.map((conversation) => <li key={conversation.id}><button type="button" onClick={() => navigate(`/messages/${conversation.id}`)} className={`w-full px-4 py-3 text-left hover:bg-slate-50 ${conversation.id === conversationId ? 'bg-blue-50' : ''}`}><span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-semibold text-slate-900">{conversation.participant.name}</span><span className="text-[10px] text-slate-500">{conversation.participant.role}</span></span><span className="mt-1 flex items-center justify-between gap-2"><span className="truncate text-xs text-slate-500">{conversation.latestMessage?.body ?? 'No messages yet'}</span>{conversation.unreadCount > 0 && <span className="rounded-full bg-brand-600 px-1.5 text-[10px] font-semibold text-white">{conversation.unreadCount}</span>}</span></button></li>)}</ul> : <p className="p-5 text-sm text-slate-500">No conversations yet. Choose an eligible teammate above to begin.</p>}
        </div>
      </Card>

      <Card className="flex min-h-[65vh] flex-col p-0">
        {!conversationId || !active ? <EmptyState icon={MessageSquare} title="Choose a conversation" description="Messages are private and limited to your reporting or project relationships." /> : <>
          <header className="border-b border-slate-200 px-4 py-3"><h2 className="font-semibold text-slate-900">{active.participant.name}</h2><p className="text-xs text-slate-500">{active.participant.role}</p></header>
          <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
            {messages.map((message) => {
              const own = message.senderId?._id === user?._id;
              return <div key={message._id} className={`flex ${own ? 'justify-end' : 'justify-start'}`}><article className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 ${own ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-900'}`}><p className="mb-1 text-[10px] opacity-75">{message.senderId?.name ?? 'FlowPilot'} · {message.senderId?.role ?? ''}</p><p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>{message.relatedTaskId && <Link className={`mt-2 inline-block text-xs underline ${own ? 'text-blue-100' : 'text-brand-700'}`} to={`/tasks/${message.relatedTaskId._id}`}>Task: {message.relatedTaskId.title}</Link>}<time className="mt-1 block text-right text-[10px] opacity-70">{new Date(message.createdAt).toLocaleString()}{own ? ` · ${message.readAt ? 'Read' : 'Sent'}` : ''}</time></article></div>;
            })}
            {messages.length === 0 && <p className="py-10 text-center text-sm text-slate-500">Start the conversation with a message.</p>}
          </div>
          <form onSubmit={submitMessage} className="flex items-end gap-2 border-t border-slate-200 p-3"><label className="sr-only" htmlFor="message-draft">Write a message</label><textarea id="message-draft" value={draft} onChange={(e) => setDraft(e.target.value.slice(0, 4000))} rows={2} maxLength={4000} placeholder="Write a message…" className="min-h-11 flex-1 resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400" /><Button type="submit" disabled={!draft.trim() || sending} isLoading={sending}><Send className="h-4 w-4" /> Send</Button></form>
        </>}
      </Card>
    </div>
    <p className="mt-3 text-xs text-slate-500">Updates refresh every few seconds. Email delivery is not configured; in-app messages remain available.</p>
  </div>;
}
