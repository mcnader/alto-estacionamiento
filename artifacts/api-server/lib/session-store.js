const path = require('path');
const Database = require('better-sqlite3');
const session = require('express-session');

module.exports = function createStore(dataDir) {
  const db = new Database(path.join(dataDir, 'sessions.db'));
  db.pragma('journal_mode = WAL');
  db.exec(`CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    sess TEXT NOT NULL,
    expire INTEGER NOT NULL
  )`);

  class SqliteStore extends session.Store {
    get(sid, cb) {
      try {
        const row = db.prepare('SELECT sess, expire FROM sessions WHERE sid = ?').get(sid);
        if (!row) return cb(null, null);
        if (row.expire < Date.now()) {
          db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
          return cb(null, null);
        }
        cb(null, JSON.parse(row.sess));
      } catch (e) { cb(e); }
    }
    set(sid, sess, cb) {
      try {
        const expire = sess.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + 7 * 24 * 60 * 60 * 1000;
        db.prepare('INSERT OR REPLACE INTO sessions (sid, sess, expire) VALUES (?, ?, ?)').run(sid, JSON.stringify(sess), expire);
        cb && cb(null);
      } catch (e) { cb && cb(e); }
    }
    destroy(sid, cb) {
      try { db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid); cb && cb(null); }
      catch (e) { cb && cb(e); }
    }
    touch(sid, sess, cb) {
      try {
        const expire = sess.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + 7 * 24 * 60 * 60 * 1000;
        db.prepare('UPDATE sessions SET expire = ? WHERE sid = ?').run(expire, sid);
        cb && cb(null);
      } catch (e) { cb && cb(e); }
    }
  }
  return new SqliteStore();
};
