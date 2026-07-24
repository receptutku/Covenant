import { config } from 'dotenv'

/**
 * Script'ler için ortam yükleyici.
 *
 * Next.js `.env.local`'ı kendi yükler, ama `tsx` ile çalışan script'ler yüklemez.
 * Bu modülü her script'in EN ÜSTÜNDE import et — diğer importlardan önce çalışması
 * gerekir, yoksa `lib/hedera/client.ts` env'i boş görür.
 */
config({ path: '.env.local', quiet: true })
config({ path: '.env', quiet: true })
