// Netlify Function (v2). Data is stored as JSON text in Netlify Blobs. No separate database.
import { getStore } from '@netlify/blobs'
import { handle } from '../lib/library-core.mjs'

export default async (req) => handle(req, getStore('stagelyrics'), process.env.EDIT_KEY || '555')

export const config = { path: '/api/library' }
