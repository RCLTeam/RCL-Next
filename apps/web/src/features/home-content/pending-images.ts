// Uploads may finish after the editor unmounts. Delay disposal during a save so
// cleanup cannot race the request that attaches the images to an article.
export class PendingImages {
  private readonly urls = new Set<string>();
  private disposed = false;
  private saving = false;
  constructor(private readonly remove: (urls: string[]) => Promise<unknown>) {}
  resume() {
    this.disposed = false;
  }
  add(url: string) {
    this.urls.add(url);
    if (this.disposed) this.cleanup();
  }
  dispose() {
    this.disposed = true;
    this.cleanup();
  }
  async save<T>(persist: (urls: string[]) => Promise<T>): Promise<T> {
    this.saving = true;
    try {
      const result = await persist([...this.urls]);
      this.urls.clear();
      return result;
    } finally {
      this.saving = false;
      if (this.disposed) this.cleanup();
    }
  }
  private cleanup() {
    if (this.saving || !this.urls.size) return;
    const urls = [...this.urls];
    this.urls.clear();
    // The server's orphan sweep retries cleanup when the browser is offline.
    void this.remove(urls).catch(() => {});
  }
}
