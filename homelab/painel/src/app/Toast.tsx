export function Toast({ mensagem }: { mensagem: string | null }) {
  return (
    <div className="toast-area" role="status" aria-live="polite">
      {mensagem && <div className="toast">{mensagem}</div>}
    </div>
  );
}
