import { Injectable, Logger } from '@nestjs/common';

// Avisa al sitio público (Next) que una campaña cambió, para que su página se
// regenere al instante en vez de esperar el ISR de 60 s.
//
// Config (backend/.env):
//   WEB_REVALIDATE_URL=https://nosxotros.pe/api/revalidate
//   WEB_REVALIDATE_SECRET=<mismo valor que REVALIDATE_SECRET en web/.env>
//
// Sin esas variables no hace nada: el sitio igual se refresca por ISR.
@Injectable()
export class WebRevalidateService {
  private readonly logger = new Logger(WebRevalidateService.name);

  // Nunca lanza ni bloquea: una campaña no puede fallar porque el sitio público
  // esté caído. Lo peor que pasa es que la página tarde el ISR en refrescarse.
  revalidateCampaign(slug?: string): void {
    const url = process.env.WEB_REVALIDATE_URL;
    const secret = process.env.WEB_REVALIDATE_SECRET;
    if (!url || !secret) return;

    void fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-revalidate-secret': secret },
      body: JSON.stringify({ slug }),
      signal: AbortSignal.timeout(5000),
    })
      .then((res) => {
        if (!res.ok) this.logger.warn(`Revalidación del sitio falló: HTTP ${res.status}`);
      })
      .catch((err: Error) => {
        this.logger.warn(`No se pudo revalidar el sitio: ${err.message}`);
      });
  }
}
