/** Share concurrent reads only. A settled value is always read again. */
export function createInflightRead<T>(read: (key: string) => Promise<T>) {
  const pending = new Map<string, Promise<T>>();
  return (key: string): Promise<T> => {
    const hit = pending.get(key);
    if (hit) return hit;
    const request = Promise.resolve().then(() => read(key));
    pending.set(key, request);
    const clear = () => {
      if (pending.get(key) === request) pending.delete(key);
    };
    void request.then(clear, clear);
    return request;
  };
}
