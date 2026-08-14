import { Context } from 'hono';

export async function validate(c: Context, next: () => Promise<void>) {
  const schema = c.get('schema');
  if (!schema) {
    await next();
    return;
  }

  const result = await schema.parseAsync(c.req.json());
  c.set('validatedBody', result);
  await next();
}
