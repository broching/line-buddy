"use client";

import { use, useRef, useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  IconBooks,
  IconUpload,
  IconTrash,
  IconLoader2,
  IconFileText,
  IconSearch,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";

export default function KnowledgeSourcesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = use(params);
  const org = useQuery(api.organizations.get, { slug: orgSlug });

  const sources = useQuery(
    api.knowledgeSources.list,
    org ? { organizationId: org._id } : "skip"
  );

  const generateUploadUrl = useMutation(api.knowledgeSources.generateUploadUrl);
  const removeSource = useMutation(api.knowledgeSources.remove);
  const ingestDocument = useAction(api.templateDocumentsNode.ingestDocument);

  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { confirmDialog, ConfirmDialogNode } = useConfirm();

  async function handleFileUpload(file: File) {
    if (!org) return;
    setUploading(true);
    try {
      const uploadUrl = await generateUploadUrl({ organizationId: org._id });
      const uploadRes = await fetch(uploadUrl, {
        method: "POST",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      if (!uploadRes.ok) throw new Error("Upload failed");
      const { storageId } = await uploadRes.json();
      await ingestDocument({
        organizationId: org._id,
        title: file.name,
        storageId: storageId as Id<"_storage">,
      });
      toast.success(`"${file.name}" processed and indexed`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete(sourceId: Id<"knowledgeSources">, title: string) {
    if (!org) return;
    const ok = await confirmDialog({
      title: `Delete "${title}"?`,
      description:
        "This will permanently remove the knowledge source and all its indexed chunks from every template. This cannot be undone.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await removeSource({ organizationId: org._id, knowledgeSourceId: sourceId });
      toast.success("Knowledge source deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  const filtered = (sources ?? []).filter((s) =>
    s.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6">
      {ConfirmDialogNode}

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Knowledge Sources</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Upload documents for AI-powered product FAQ answering. Enable sources per template.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,.md"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFileUpload(file);
            }}
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || !org}
          >
            {uploading ? (
              <>
                <IconLoader2 className="size-4 animate-spin" />
                Processing…
              </>
            ) : (
              <>
                <IconUpload className="size-4" />
                Upload document
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3.5 text-sm text-muted-foreground">
        <IconBooks className="size-4 mt-0.5 shrink-0" />
        <span>
          Knowledge sources are shared across your organization. Go to a template&apos;s{" "}
          <strong>Knowledge Sources</strong> tab to enable or disable specific sources for that template&apos;s AI pipeline.
        </span>
      </div>

      {/* Search */}
      {sources && sources.length > 3 && (
        <div className="relative max-w-sm">
          <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search knowledge sources…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      {/* List */}
      {sources === undefined ? (
        <div className="flex flex-col gap-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <IconBooks className="size-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">
            {search ? "No matching knowledge sources" : "No knowledge sources yet"}
          </p>
          {!search && (
            <p className="text-xs text-muted-foreground mt-1">
              Upload a PDF, TXT, or Markdown file to get started.
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((source) => (
            <SourceRow
              key={source._id}
              source={source}
              onDelete={() => void handleDelete(source._id, source.title)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SourceRow({
  source,
  onDelete,
}: {
  source: {
    _id: Id<"knowledgeSources">;
    title: string;
    totalChunks: number;
    createdAt: number;
    description?: string;
  };
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3">
      <IconFileText className="size-5 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{source.title}</p>
        <p className="text-xs text-muted-foreground">
          {source.totalChunks} chunk{source.totalChunks !== 1 ? "s" : ""} &middot;{" "}
          {new Date(source.createdAt).toLocaleDateString()}
        </p>
      </div>
      <Badge variant="secondary" className="text-xs shrink-0">
        {source.totalChunks} chunks
      </Badge>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 text-muted-foreground hover:text-destructive shrink-0"
        onClick={onDelete}
        title="Delete knowledge source"
      >
        <IconTrash className="size-4" />
      </Button>
    </div>
  );
}
