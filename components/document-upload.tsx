'use client';
import { useRef, useState } from 'react';
import {
  Upload,
  FileText,
  Loader2,
  X,
  ChevronDown,
  AlertCircle,
} from 'lucide-react';
import type { UploadedDocument } from '@/lib/types';
import { useLanguage } from '@/lib/language';
export const warningLabels: Record<string, string> = {
  ocr_review: 'Vérifiez le texte reconnu sur les pages scannées.',
  empty_pages: 'Certaines pages ne contiennent pas de texte lisible.',
  text_limit: 'Le texte a été limité à 40 000 caractères.',
  pptx_visuals:
    'Seul le texte des diapositives PowerPoint est extrait. Pour les images et schémas, ajoutez un PDF ou une capture.',
};
export function DocumentUpload({
  documents,
  onChange,
  onBusy,
  disabled = false,
}: {
  documents: UploadedDocument[];
  onChange: (value: UploadedDocument[]) => void;
  onBusy: (value: boolean) => void;
  disabled?: boolean;
}) {
  const { t } = useLanguage();
  const input = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  const [reading, setReading] = useState(''),
    [error, setError] = useState(''),
    [expanded, setExpanded] = useState<string | null>(null);
  async function add(files: FileList | null) {
    if (!files || disabled || lock.current) return;
    lock.current = true;
    onBusy(true);
    setError('');
    const next = [...documents];
    try {
      if (next.length + files.length > 3)
        throw new Error('Trois documents maximum par projet.');
      for (const file of Array.from(files)) {
        if (file.size > 10 * 1024 * 1024)
          throw new Error('Le fichier dépasse 10 Mo.');
        if (!/\.(pdf|pptx|png|jpe?g)$/i.test(file.name))
          throw new Error(
            'Format non pris en charge. Utilisez un PDF, PPTX, PNG ou JPEG.',
          );
        setReading(file.name);
        const response = await fetch('/api/documents', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-File-Name': encodeURIComponent(file.name),
          },
          body: file,
        });
        const result = (await response.json()) as UploadedDocument & {
          error?: string;
        };
        if (!response.ok)
          throw new Error(result.error || 'La requête a échoué.');
        if (next.some((doc) => doc.sha256 === result.sha256))
          throw new Error('Fichier déjà ajouté.');
        next.push(result);
        onChange([...next]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'La requête a échoué.');
    } finally {
      lock.current = false;
      setReading('');
      onBusy(false);
      if (input.current) input.current.value = '';
    }
  }
  return (
    <section className="document-upload" aria-label={t('Slides et documents')}>
      <div className="upload-heading">
        <span>{t('Slides et documents')}</span>
        <small>{t('Facultatif')}</small>
      </div>
      <input
        ref={input}
        id="document-files"
        className="sr-only"
        type="file"
        multiple
        accept=".pdf,.pptx,.png,.jpg,.jpeg"
        aria-label={t('Ajouter des fichiers')}
        disabled={disabled || !!reading}
        onChange={(e) => void add(e.target.files)}
      />
      <button
        type="button"
        className="upload-zone"
        disabled={disabled || !!reading || documents.length >= 3}
        onClick={() => input.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void add(e.dataTransfer.files);
        }}
      >
        {reading ? (
          <Loader2 size={20} className="spin" />
        ) : (
          <Upload size={20} />
        )}
        <span>
          <strong>
            {reading ? t('Lecture du document…') : t('Ajouter des fichiers')}
          </strong>
          <small>
            {reading || t('Déposez vos fichiers ici ou sélectionnez-les.')}
          </small>
        </span>
      </button>
      <p className="field-help">
        {t('PDF, PPTX, PNG ou JPEG · 10 Mo par fichier · 3 fichiers maximum')}
      </p>
      <output aria-live="polite">
        {error && (
          <span className="upload-error">
            <AlertCircle size={14} />
            {t(error)}
          </span>
        )}
      </output>
      {documents.map((doc) => (
        <article className="uploaded-document" key={doc.id}>
          <div className="document-row">
            <FileText size={17} />
            <div>
              <strong>{doc.name}</strong>
              <small>
                {doc.pages.length} {t('page(s)')} ·{' '}
                {Math.ceil(doc.bytes / 1024)} KB
              </small>
            </div>
            <button
              type="button"
              disabled={!!reading || disabled}
              aria-label={t('Retirer le document') + ' ' + doc.name}
              onClick={() => onChange(documents.filter((d) => d.id !== doc.id))}
            >
              <X size={16} />
            </button>
          </div>
          {doc.warnings.map((w) => (
            <p className="document-warning" key={w}>
              {t(warningLabels[w] || w)}
            </p>
          ))}
          <button
            type="button"
            className="extraction-toggle"
            aria-expanded={expanded === doc.id}
            onClick={() => setExpanded(expanded === doc.id ? null : doc.id)}
          >
            {t(
              expanded === doc.id
                ? 'Masquer le texte'
                : 'Voir le texte extrait',
            )}
            <ChevronDown size={14} />
          </button>
          {expanded === doc.id && (
            <div className="extracted-pages">
              {doc.pages.map((page) => (
                <section key={page.number}>
                  <h4>
                    {doc.format === 'pptx' ? 'Slide' : 'Page'} {page.number}
                    {page.method === 'ocr' ? ' · OCR' : ''}
                  </h4>
                  <p>{page.text || t('Aucun texte sur cette page.')}</p>
                </section>
              ))}
            </div>
          )}
        </article>
      ))}
      <p className="field-help">
        {t(
          'Les fichiers sont lus localement. Leur texte rejoint le brief au lancement.',
        )}
      </p>
    </section>
  );
}
