/**
 * AsyncQueue — concurrent push/pull queue.
 * Allows the provider to yield SSE events while canUseTool awaits user response.
 *
 * Producer: queue.push(value)
 * Consumer: for await (const value of queue) { ... }
 * Finish:   queue.close()
 */
export class AsyncQueue {
  constructor() {
    this._buffer = [];
    this._resolvers = [];
    this._closed = false;
  }

  push(value) {
    if (this._closed) return;
    if (this._resolvers.length > 0) {
      const resolve = this._resolvers.shift();
      resolve({ value, done: false });
    } else {
      this._buffer.push(value);
    }
  }

  close() {
    this._closed = true;
    for (const resolve of this._resolvers) {
      resolve({ value: undefined, done: true });
    }
    this._resolvers = [];
  }

  [Symbol.asyncIterator]() {
    return this;
  }

  next() {
    if (this._buffer.length > 0) {
      return Promise.resolve({ value: this._buffer.shift(), done: false });
    }
    if (this._closed) {
      return Promise.resolve({ value: undefined, done: true });
    }
    return new Promise(resolve => {
      this._resolvers.push(resolve);
    });
  }
}
