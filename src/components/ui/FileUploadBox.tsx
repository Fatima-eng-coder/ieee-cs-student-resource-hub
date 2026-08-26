import { useRef, useState } from 'react';
import Icon from '@/components/ui/Icon';

interface FileUploadBoxProps {
  label?: string;
  accept?: string;
  onFileSelect?: (file: File | null) => void;
}

export default function FileUploadBox({ label = 'Upload File', accept, onFileSelect }: FileUploadBoxProps) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File | null) => {
    setFileName(file?.name ?? null);
    onFileSelect?.(file);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handleFile(e.dataTransfer.files?.[0] ?? null);
      }}
      onClick={() => inputRef.current?.click()}
      className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition ${
        dragOver ? 'border-ieee-orange bg-ieee-orange/5' : 'border-slate-300 bg-slate-50 hover:border-ieee-orange/60'
      }`}
    >
      <Icon name="upload" className="h-7 w-7 text-slate-400" />
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className="text-xs text-slate-400">{fileName ?? 'Drag & drop, or click to browse'}</p>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}
