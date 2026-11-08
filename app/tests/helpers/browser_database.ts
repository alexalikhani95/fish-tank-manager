import mongoose from 'mongoose'

// Destructive cleanup is restricted to this named, disposable browser database.
export default async function setup() {
  const uri = process.env.MONGO_BROWSER_URL ?? 'mongodb://127.0.0.1:27017/fishtank_browser'
  if (new URL(uri).pathname !== '/fishtank_browser')
    throw new Error('Browser tests require fishtank_browser; refusing cleanup')
  async function clean() {
    const connection = await mongoose.createConnection(uri).asPromise()
    try {
      await connection.dropDatabase()
    } finally {
      await connection.close()
    }
  }
  await clean()
  return clean
}
