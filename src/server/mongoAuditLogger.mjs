import fs from 'node:fs'
import path from 'node:path'
import { MongoClient } from 'mongodb'

class MongoAuditLogger {
  constructor() {
    this.client = null
    this.db = null
    this.isConnected = false
    this.connectionUri = process.env.MONGODB_URI || ''
    this.dbName = process.env.MONGODB_DB || 'smartslot_ai'
    this.buffer = []
    this.bufferFile = path.resolve('data/audit_buffer.json')
    this.stats = {
      totalCommandsLogged: 0,
      totalRequestsLogged: 0,
      totalResponsesLogged: 0,
      lastLogTime: null,
      status: 'Disconnected (Waiting for Connection String)',
    }

    // Ensure data directory exists
    try {
      if (!fs.existsSync('data')) fs.mkdirSync('data', { recursive: true })
      if (fs.existsSync(this.bufferFile)) {
        const raw = fs.readFileSync(this.bufferFile, 'utf8')
        this.buffer = JSON.parse(raw)
      }
    } catch {
      this.buffer = []
    }

    if (this.connectionUri) {
      this.connect(this.connectionUri)
    }
  }

  async connect(uri) {
    if (!uri) return { ok: false, error: 'Empty connection string' }
    try {
      if (this.client) {
        await this.client.close()
      }
      this.connectionUri = uri
      this.client = new MongoClient(uri, {
        serverSelectionTimeoutMS: 5000,
      })
      await this.client.connect()
      this.db = this.client.db(this.dbName)
      this.isConnected = true
      this.stats.status = 'Connected to MongoDB Atlas'
      console.log(`\x1b[1;32m[MongoDB] Successfully connected to database: ${this.dbName}\x1b[0m`)

      // Flush buffered logs
      await this.flushBuffer()
      return { ok: true, message: `Connected to MongoDB Atlas (${this.dbName})` }
    } catch (err) {
      this.isConnected = false
      this.stats.status = `Connection error: ${err.message}`
      console.error('\x1b[31m[MongoDB] Connection failed:\x1b[0m', err.message)
      return { ok: false, error: err.message }
    }
  }

  async flushBuffer() {
    if (!this.isConnected || !this.db || this.buffer.length === 0) return
    try {
      const items = [...this.buffer]
      this.buffer = []
      const commandsCol = this.db.collection('smartslot_commands_log')
      await commandsCol.insertMany(items)
      fs.writeFileSync(this.bufferFile, JSON.stringify([], null, 2))
      console.log(`\x1b[32m[MongoDB] Flushed ${items.length} buffered logs to MongoDB Atlas.\x1b[0m`)
    } catch (err) {
      console.error('[MongoDB] Failed to flush buffer:', err.message)
    }
  }

  async logCommand(command) {
    const entry = {
      _id: `CMD-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      type: command.type || 'COMMAND',
      role: command.role || 'system',
      port: command.port || 5175,
      action: command.action || 'GENERIC',
      payload: command.payload || {},
      status: command.status || 'PROCESSED',
      metadata: {
        nodeVersion: process.version,
        platform: process.platform,
      },
    }

    this.stats.totalCommandsLogged++
    this.stats.lastLogTime = entry.timestamp

    if (this.isConnected && this.db) {
      try {
        await this.db.collection('smartslot_commands_log').insertOne(entry)
      } catch {
        this.saveToBuffer(entry)
      }
    } else {
      this.saveToBuffer(entry)
    }

    return entry
  }

  async logHttpRequest(reqData) {
    const entry = {
      _id: `REQ-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      method: reqData.method,
      url: reqData.url,
      clientPort: reqData.port,
      headers: reqData.headers,
      requestPayload: reqData.body,
      responsePayload: reqData.response,
      statusCode: reqData.statusCode || 200,
      durationMs: reqData.durationMs || 0,
    }

    this.stats.totalRequestsLogged++
    this.stats.totalResponsesLogged++
    this.stats.lastLogTime = entry.timestamp

    if (this.isConnected && this.db) {
      try {
        await this.db.collection('smartslot_http_requests_log').insertOne(entry)
      } catch {
        this.saveToBuffer(entry)
      }
    } else {
      this.saveToBuffer(entry)
    }

    return entry
  }

  saveToBuffer(entry) {
    this.buffer.push(entry)
    if (this.buffer.length > 500) this.buffer.shift()
    try {
      fs.writeFileSync(this.bufferFile, JSON.stringify(this.buffer, null, 2))
    } catch {}
  }

  async getRecentLogs(limit = 25) {
    if (this.isConnected && this.db) {
      try {
        const commands = await this.db
          .collection('smartslot_commands_log')
          .find({})
          .sort({ timestamp: -1 })
          .limit(limit)
          .toArray()
        return commands
      } catch {
        return this.buffer.slice(-limit).reverse()
      }
    }
    return this.buffer.slice(-limit).reverse()
  }

  getStatus() {
    return {
      connected: this.isConnected,
      status: this.stats.status,
      uriConfigured: Boolean(this.connectionUri),
      maskedUri: this.connectionUri ? this.connectionUri.replace(/:([^@]+)@/, ':****@') : '',
      dbName: this.dbName,
      bufferedCount: this.buffer.length,
      totalCommandsLogged: this.stats.totalCommandsLogged,
      totalRequestsLogged: this.stats.totalRequestsLogged,
      lastLogTime: this.stats.lastLogTime,
    }
  }
}

export const mongoLogger = new MongoAuditLogger()
