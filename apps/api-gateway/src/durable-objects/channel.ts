export class ChannelDO {
  constructor(private _state: DurableObjectState, private _env: unknown) {}

  async fetch(_request: Request): Promise<Response> {
    return new Response('ChannelDO stub');
  }
}
