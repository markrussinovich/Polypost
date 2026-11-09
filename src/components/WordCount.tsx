export function WordCount({ count }: { count: number }) {
  return (
    <div className="draft-word-count" aria-label="Main draft word count">
      {count.toLocaleString()} {count === 1 ? 'word' : 'words'}
    </div>
  );
}
