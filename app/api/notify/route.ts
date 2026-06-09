import { createClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '').trim()

  if (!token) {
    return Response.json({ success: false, error: 'Unauthorized' }, { status: 403 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) {
    return Response.json({ success: false, error: 'Unauthorized' }, { status: 403 })
  }

  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'staff') {
    return Response.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  let body: { phone: string; message: string; hikeDayId: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ success: false, error: 'Invalid request body' }, { status: 400 })
  }

  const { phone, message } = body
  if (!phone || !message) {
    return Response.json({ success: false, error: 'Missing phone or message' }, { status: 400 })
  }

  const waPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const waToken = process.env.WHATSAPP_ACCESS_TOKEN
  if (!waPhoneId || !waToken) {
    return Response.json({ success: false, error: 'WhatsApp not configured' }, { status: 500 })
  }

  const e164 = phone.startsWith('+') ? phone : `+${phone}`

  try {
    const res = await fetch(`https://graph.facebook.com/v17.0/${waPhoneId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${waToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: e164,
        type: 'text',
        text: { body: message },
      }),
    })
    if (!res.ok) {
      const errText = await res.text()
      return Response.json({ success: false, error: errText }, { status: 502 })
    }
    return Response.json({ success: true })
  } catch (err) {
    return Response.json({ success: false, error: String(err) }, { status: 500 })
  }
}
