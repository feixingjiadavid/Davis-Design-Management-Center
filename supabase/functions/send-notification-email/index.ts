import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
serve(async (req) => {
  try {
    const { record } = await req.json() 
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: 'DavisCenter <onboarding@resend.dev>', 
        to: [record.target_email],
        subject: `【系统动态】来自 ${record.sender_name} 的提醒`,
        html: `<h3>系统通知</h3><p>${record.content}</p><p><a href="https://feixingjiadavid.github.io/Davis-Design-Management-Center/${record.link_url}">点此进入处理</a></p>`
      }),
    })
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } })
  } catch (err) { return new Response(JSON.stringify({ error: err.message }), { status: 500 }) }
})