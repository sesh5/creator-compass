import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { Send, Loader2, Trash2, Sparkles, Globe } from "lucide-react";
import {
  listTeardownMessages,
  sendTeardownMessage,
  clearTeardownMessages,
  type ChatMessage,
  type ChatSource,
} from "@/lib/teardown-chat.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "Why is this channel growing so fast?",
  "What hook style should I copy?",
  "Why did their top video blow up?",
];

export function TeardownChat({ channelId, channelName }: { channelId: string; channelName: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listTeardownMessages);
  const sendFn = useServerFn(sendTeardownMessage);
  const clearFn = useServerFn(clearTeardownMessages);
  const queryKey = ["teardown-chat", channelId];

  const { data: messages = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => listFn({ data: { channel_id: channelId } }),
    staleTime: 1000 * 30,
  });

  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const sendMut = useMutation({
    mutationFn: (message: string) => sendFn({ data: { channel_id: channelId, message } }),
    onMutate: async (message) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<ChatMessage[]>(queryKey) ?? [];
      const optimistic: ChatMessage = {
        id: `tmp-${Date.now()}`,
        role: "user",
        content: message,
        sources: null,
        created_at: new Date().toISOString(),
      };
      qc.setQueryData<ChatMessage[]>(queryKey, [...prev, optimistic]);
      return { prev };
    },
    onError: (err, _m, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
      toast.error((err as Error).message || "Failed to send message");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey });
      setTimeout(() => textareaRef.current?.focus(), 50);
    },
  });

  const clearMut = useMutation({
    mutationFn: () => clearFn({ data: { channel_id: channelId } }),
    onSuccess: () => {
      qc.setQueryData(queryKey, []);
      toast.success("Chat cleared");
    },
    onError: (e) => toast.error((e as Error).message || "Failed to clear"),
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sendMut.isPending]);

  const submit = () => {
    const text = input.trim();
    if (!text || sendMut.isPending) return;
    setInput("");
    sendMut.mutate(text);
  };

  const isPending = sendMut.isPending;

  return (
    <section className="surface-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-display text-xl font-semibold flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" /> Ask about {channelName}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Chat with AI about this teardown. It can search the web for context when needed.
          </p>
        </div>
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => clearMut.mutate()}
            disabled={clearMut.isPending}
          >
            <Trash2 className="w-4 h-4 mr-1" /> Clear
          </Button>
        )}
      </div>

      <div className="space-y-4 max-h-[520px] overflow-y-auto pr-1">
        {isLoading ? (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading conversation…
          </div>
        ) : messages.length === 0 && !isPending ? (
          <div className="rounded-lg border border-dashed p-4">
            <p className="text-sm text-muted-foreground mb-3">Try asking:</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setInput(s)}
                  className="px-3 py-1.5 rounded-full text-xs bg-accent hover:bg-accent/70 border transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} msg={m} />)
        )}
        {isPending && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground animate-pulse">
            <Loader2 className="w-4 h-4 animate-spin" /> Thinking…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="mt-4 flex gap-2 items-end">
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Ask anything about this channel…"
          rows={2}
          disabled={isPending}
          className="resize-none"
        />
        <Button onClick={submit} disabled={isPending || !input.trim()} className="brand-gradient border-0 h-auto py-3">
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>
    </section>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm px-4 py-2.5 bg-primary text-primary-foreground text-sm whitespace-pre-wrap">
          {msg.content}
        </div>
      </div>
    );
  }
  return (
    <div className="max-w-[95%]">
      <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-2 prose-ul:my-2 prose-a:text-primary">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
      </div>
      {msg.sources && msg.sources.length > 0 && <SourcesRow sources={msg.sources} />}
    </div>
  );
}

function SourcesRow({ sources }: { sources: ChatSource[] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2 items-center">
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Globe className="w-3 h-3" /> Sources:
      </span>
      {sources.map((s) => (
        <a
          key={s.url}
          href={s.url}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "px-2 py-0.5 rounded-full text-xs bg-accent hover:bg-accent/70 border transition-colors",
          )}
          title={s.title}
        >
          {s.domain}
        </a>
      ))}
    </div>
  );
}
