"use client";

import { ChangeEvent, FormEvent, KeyboardEvent, useRef, useState } from "react";
import { Attachment, ChatRequestOptions } from "ai";
import { Link2, Paperclip, Send, X } from "lucide-react";

interface MessageInputProps {
  input: string;
  handleInputChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  handleSubmit: (
    e?: { preventDefault?: () => void },
    chatRequestOptions?: ChatRequestOptions
  ) => void;
  isLoading: boolean;
}

export function MessageInput({
  input,
  handleInputChange,
  handleSubmit,
  isLoading,
}: MessageInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [imageUrlInput, setImageUrlInput] = useState("");

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const form = e.currentTarget.form;
      if (form) {
        form.requestSubmit();
      }
    }
  };

  const addImageUrl = () => {
    const url = imageUrlInput.trim();
    if (!url) {
      return;
    }

    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return;
      }

      const normalizedUrl = parsed.toString();
      if (attachments.some((attachment) => attachment.url === normalizedUrl)) {
        setImageUrlInput("");
        return;
      }

      setAttachments((prev) => [
        ...prev,
        {
          url: normalizedUrl,
          contentType: "image/*",
          name: normalizedUrl.split("/").pop() || "remote-image",
        },
      ]);
      setImageUrlInput("");
    } catch {
      // Ignore invalid URLs and keep the current input untouched.
    }
  };

  const handleFileSelection = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) {
      return;
    }

    const imageFiles = Array.from(files).filter((file) =>
      file.type.startsWith("image/")
    );

    const dataUrlAttachments = await Promise.all(
      imageFiles.map(
        (file) =>
          new Promise<Attachment>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              if (typeof reader.result === "string") {
                resolve({
                  name: file.name,
                  contentType: file.type,
                  url: reader.result,
                });
              } else {
                reject(new Error("Could not read selected file as data URL."));
              }
            };
            reader.onerror = () => {
              reject(new Error("Failed to read selected file."));
            };
            reader.readAsDataURL(file);
          })
      )
    );

    setAttachments((prev) => [...prev, ...dataUrlAttachments]);
    e.target.value = "";
  };

  const removeAttachment = (indexToRemove: number) => {
    setAttachments((prev) =>
      prev.filter((_, attachmentIndex) => attachmentIndex !== indexToRemove)
    );
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    handleSubmit(e, {
      experimental_attachments: attachments.length > 0 ? attachments : undefined,
      allowEmptySubmit: attachments.length > 0,
    });
    setAttachments([]);
  };

  const submitDisabled =
    isLoading || (!input?.trim() && attachments.length === 0);

  return (
    <form onSubmit={onSubmit} className="relative p-4 bg-white border-t border-neutral-200/60">
      <div className="relative max-w-4xl mx-auto">
        {attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {attachments.map((attachment, index) => {
              const isImageAttachment = attachment.contentType?.startsWith("image/");
              return (
                <div
                  key={`${attachment.url}-${index}`}
                  className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1"
                >
                  {isImageAttachment ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={attachment.url}
                      alt={attachment.name || "Attachment"}
                      className="h-8 w-8 rounded object-cover"
                    />
                  ) : null}
                  <span className="max-w-36 truncate text-xs text-neutral-700">
                    {attachment.name || "image"}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(index)}
                    className="rounded p-0.5 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-800"
                    aria-label="Remove attachment"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="mb-2 flex gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Paperclip className="h-3.5 w-3.5" />
            Add image
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2">
            <Link2 className="h-3.5 w-3.5 text-neutral-500" />
            <input
              value={imageUrlInput}
              onChange={(e) => setImageUrlInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addImageUrl();
                }
              }}
              placeholder="Attach image URL (https://...)"
              disabled={isLoading}
              className="w-full bg-transparent py-1.5 text-xs text-neutral-800 outline-none placeholder:text-neutral-400"
            />
            <button
              type="button"
              onClick={addImageUrl}
              disabled={isLoading || !imageUrlInput.trim()}
              className="rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileSelection}
          className="hidden"
        />

        <textarea
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Describe the React component you want to create (optionally attach images)..."
          disabled={isLoading}
          className="w-full min-h-[80px] max-h-[200px] pl-4 pr-14 py-3.5 rounded-xl border border-neutral-200 bg-neutral-50/50 text-neutral-900 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500/50 focus:bg-white transition-all placeholder:text-neutral-400 text-[15px] font-normal shadow-sm"
          rows={3}
        />
        <button 
          type="submit" 
          disabled={submitDisabled}
          className="absolute right-3 bottom-3 p-2.5 rounded-lg transition-all hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent group"
        >
          <Send className={`h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 ${submitDisabled ? 'text-neutral-300' : 'text-blue-600'}`} />
        </button>
      </div>
    </form>
  );
}