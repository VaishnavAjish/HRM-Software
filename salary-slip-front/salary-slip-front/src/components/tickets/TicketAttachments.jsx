import { useState } from "react";
import toast from "react-hot-toast";
import { Paperclip, Download, Trash2, FileText, Image as ImageIcon, Loader2 } from "lucide-react";
import { ticketApi } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import { formatDateTimeShort, formatDateTime } from "./ticketMeta";

/**
 * Files attached to a ticket, shared by the staff and employee drawers.
 *
 * Downloads go through ticketApi.downloadAttachment rather than an <a href>:
 * the endpoint needs the bearer token, so a plain link would 401. That also
 * keeps the file behind the same visibility check as the ticket itself.
 */
export default function TicketAttachments({ ticketId, attachments = [], canManage, currentUserId, onChanged }) {
  const { user } = useAuth();
  const [busyId, setBusyId] = useState(null);

  if (attachments.length === 0) return null;

  const download = async (attachment) => {
    setBusyId(attachment.id);
    try {
      await ticketApi.downloadAttachment(
        ticketId,
        attachment.id,
        attachment.file_name,
        user?.accessToken,
        user?.tokenType,
      );
    } catch (err) {
      toast.error(err.message || "Could not download the attachment");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (attachment) => {
    if (!window.confirm(`Remove ${attachment.file_name}? This cannot be undone.`)) return;

    setBusyId(attachment.id);
    try {
      const res = await ticketApi.deleteAttachment(
        ticketId,
        attachment.id,
        user?.accessToken,
        user?.tokenType,
      );
      res?.status ? toast.success(res.message || "Attachment removed") : toast.error(res?.message || "Failed");
      if (res?.status) await onChanged?.();
    } catch (err) {
      toast.error(err.message || "Could not remove the attachment");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="mb-6">
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        <Paperclip size={14} className="text-brand-500" /> Attachments ({attachments.length})
      </h3>

      <ul className="space-y-1.5">
        {attachments.map((attachment) => {
          const isImage = String(attachment.mime_type || "").startsWith("image/");
          const Icon = isImage ? ImageIcon : FileText;
          // Staff can remove anything; an employee only what they attached.
          const mayRemove = canManage || String(attachment.uploaded_by) === String(currentUserId);
          const busy = busyId === attachment.id;

          return (
            <li
              key={attachment.id}
              className="flex items-center gap-2.5 rounded-xl border border-gray-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-white/5"
            >
              <Icon size={15} className="shrink-0 text-gray-400" />

              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-gray-800 dark:text-gray-200" title={attachment.file_name}>
                  {attachment.file_name}
                </p>
                <p className="text-[10px] text-gray-400">
                  {humanSize(attachment.file_size)}
                  {attachment.uploader?.name ? ` · ${attachment.uploader.name}` : ""}
                  {attachment.created_at ? (
                    <span title={formatDateTime(attachment.created_at)}>
                      {" · "}{formatDateTimeShort(attachment.created_at)}
                    </span>
                  ) : null}
                </p>
              </div>

              <button
                onClick={() => download(attachment)}
                disabled={busy}
                className="shrink-0 rounded-lg p-1.5 text-gray-400 transition hover:bg-brand-50 hover:text-brand-600 disabled:opacity-40 dark:hover:bg-brand-900/20"
                title="Download"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              </button>

              {mayRemove && (
                <button
                  onClick={() => remove(attachment)}
                  disabled={busy}
                  className="shrink-0 rounded-lg p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40 dark:hover:bg-red-900/20"
                  title="Remove"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function humanSize(bytes) {
  const size = Number(bytes || 0);
  return size >= 1048576
    ? `${(size / 1048576).toFixed(1)} MB`
    : `${Math.max(1, Math.round(size / 1024))} KB`;
}
