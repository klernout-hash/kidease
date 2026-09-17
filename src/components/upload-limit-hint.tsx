/**
 * Visible size/type helper under daycare file inputs.
 * Pair with a toast so a reject is never silent.
 */
export function UploadLimitHint({ hint, error }: { hint: string; error?: string | null }) {
  return (
    <div className="mt-1 space-y-1" data-ke="upload-limit-hint">
      <p className="text-xs leading-5 text-muted">{hint}</p>
      {error ? (
        <p className="text-xs leading-5 text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
