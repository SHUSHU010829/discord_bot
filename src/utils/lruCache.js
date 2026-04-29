// 極簡 LRU：用 Map 的插入順序，set/get 命中時把 key 移到尾端，超過 max 砍最舊。
class LruCache {
  constructor(max = 256) {
    this.max = max;
    this.map = new Map();
  }

  get(key) {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key);
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key, value) {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.max) {
      const oldest = this.map.keys().next().value;
      this.map.delete(oldest);
    }
    this.map.set(key, value);
  }

  has(key) {
    return this.map.has(key);
  }

  get size() {
    return this.map.size;
  }
}

module.exports = LruCache;
