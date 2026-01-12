import {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  NodeOperationError
} from 'n8n-workflow';

export class Floyd implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Floyd',
    name: 'floyd',
    icon: 'file:floyd.svg',
    group: ['output'],
    version: 1,
    subtitle:
      '={{ $parameter.operation === "createHold" ? "Create Hold" : $parameter.operation === "confirm" ? "Confirm Booking" : "Cancel Booking" }}',
    description: 'Atomic booking holds for AI agent workflows',
    defaults: {
      name: 'Floyd'
    },
    inputs: ['main'],
    outputs: ['main'],
    credentials: [
      {
        name: 'floydApi',
        required: true
      }
    ],
    properties: [
      {
        displayName: 'Resource',
        name: 'resource',
        type: 'options',
        noDataExpression: true,
        options: [
          {
            name: 'Booking',
            value: 'booking'
          }
        ],
        default: 'booking'
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: {
          show: {
            resource: ['booking']
          }
        },
        options: [
          {
            name: 'Create Hold',
            value: 'createHold',
            action: 'Create hold',
            description: 'Reserve a time slot with a TTL. Hold expires automatically if not confirmed.'
          },
          {
            name: 'Confirm Booking',
            value: 'confirm',
            action: 'Confirm booking',
            description: 'Finalize a pending hold to convert it to a confirmed booking'
          },
          {
            name: 'Cancel Booking',
            value: 'cancel',
            action: 'Cancel booking',
            description: 'Cancel a pending hold or confirmed booking'
          }
        ],
        default: 'createHold'
      },

      // Create Hold fields
      {
        displayName: 'Resource ID',
        name: 'resourceId',
        type: 'string',
        required: true,
        displayOptions: {
          show: {
            resource: ['booking'],
            operation: ['createHold']
          }
        },
        default: '',
        description: 'The resource to book. Find it at console.floyd.run → Resources.'
      },
      {
        displayName: 'Start Time',
        name: 'startAt',
        type: 'dateTime',
        required: true,
        displayOptions: {
          show: {
            resource: ['booking'],
            operation: ['createHold']
          }
        },
        default: '',
        description: 'Slot start time (ISO 8601 format)'
      },
      {
        displayName: 'End Time',
        name: 'endAt',
        type: 'dateTime',
        required: true,
        displayOptions: {
          show: {
            resource: ['booking'],
            operation: ['createHold']
          }
        },
        default: '',
        description: 'Slot end time (ISO 8601 format)'
      },
      {
        displayName: 'Hold Duration (seconds)',
        name: 'ttlSeconds',
        type: 'number',
        displayOptions: {
          show: {
            resource: ['booking'],
            operation: ['createHold']
          }
        },
        default: 300,
        description: 'How long the hold lasts before expiring (default: 5 minutes)'
      },
      {
        displayName: 'Idempotency Key',
        name: 'idempotencyKey',
        type: 'string',
        displayOptions: {
          show: {
            resource: ['booking'],
            operation: ['createHold']
          }
        },
        default: '',
        description: 'Optional key for retry-safe requests. Same key = same result.'
      },
      {
        displayName: 'Metadata',
        name: 'metadata',
        type: 'json',
        displayOptions: {
          show: {
            resource: ['booking'],
            operation: ['createHold']
          }
        },
        default: '{}',
        description: 'Arbitrary JSON payload (customer info, external refs, etc.)'
      },
      {
        displayName: 'Return Conflicts as Output',
        name: 'returnConflictsAsOutput',
        type: 'boolean',
        displayOptions: {
          show: {
            resource: ['booking'],
            operation: ['createHold']
          }
        },
        default: true,
        description: 'Whether to return 409 conflicts as output (branchable) or fail the workflow'
      },

      // Confirm & Cancel fields
      {
        displayName: 'Booking ID',
        name: 'bookingId',
        type: 'string',
        required: true,
        displayOptions: {
          show: {
            resource: ['booking'],
            operation: ['confirm', 'cancel']
          }
        },
        default: '',
        placeholder: 'bk_abc123',
        description: 'The booking ID to confirm or cancel'
      }
    ]
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];
    const operation = this.getNodeParameter('operation', 0) as 'createHold' | 'confirm' | 'cancel';

    const credentials = await this.getCredentials('floydApi');
    const baseUrl = ((credentials.baseUrl as string) || 'https://api.floyd.run').replace(/\/$/, '');

    for (let i = 0; i < items.length; i++) {
      try {
        let responseData;

        if (operation === 'createHold') {
          responseData = await createApiAction.call(this, {
            itemIndex: i,
            baseUrl,
            endpoint: '/v1/bookings',
            prepareRequest: () => {
              const resourceId = (this.getNodeParameter('resourceId', i) as string).trim();
              const startAt = this.getNodeParameter('startAt', i) as string;
              const endAt = this.getNodeParameter('endAt', i) as string;
              const ttlSeconds = this.getNodeParameter('ttlSeconds', i) as number;
              const idempotencyKey = this.getNodeParameter('idempotencyKey', i) as string;
              const metadataRaw = this.getNodeParameter('metadata', i) as string;

              // Validate
              if (!resourceId)
                throw new NodeOperationError(this.getNode(), 'Resource ID is required.', { itemIndex: i });
              if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
                throw new NodeOperationError(this.getNode(), 'Hold Duration must be greater than zero.', {
                  itemIndex: i
                });
              }
              const startDate = new Date(startAt);
              const endDate = new Date(endAt);
              if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
                throw new NodeOperationError(this.getNode(), 'Start and end time must be valid dates.', {
                  itemIndex: i
                });
              }
              if (endDate.getTime() <= startDate.getTime()) {
                throw new NodeOperationError(this.getNode(), 'End time must be after start time.', { itemIndex: i });
              }

              // Parse metadata
              let metadata: unknown;
              try {
                metadata = typeof metadataRaw === 'string' ? JSON.parse(metadataRaw) : metadataRaw;
              } catch {
                throw new NodeOperationError(this.getNode(), 'Metadata must be valid JSON.', { itemIndex: i });
              }
              if (metadata !== undefined && (typeof metadata !== 'object' || metadata === null)) {
                throw new NodeOperationError(this.getNode(), 'Metadata must be an object.', { itemIndex: i });
              }

              const body: Record<string, unknown> = { resourceId, startAt, endAt, ttlSeconds, metadata };
              if (idempotencyKey) {
                body.idempotencyKey = idempotencyKey;
              }
              return body;
            },
            handleSuccess: (data, requestId) => ({
              bookingId: data.data?.id || data.id,
              status: data.data?.status || data.status,
              expiresAt: data.data?.expiresAt || data.expiresAt,
              requestId
            }),
            handle409: (data, requestId) => {
              const returnConflictsAsOutput = this.getNodeParameter('returnConflictsAsOutput', i) as boolean;
              const outcome = data.error?.outcome || data.outcome || 'conflict_overlap';
              const message = data.error?.message || data.message || 'Booking conflict';

              if (returnConflictsAsOutput) {
                return { outcome, message, requestId };
              }
              throw new NodeOperationError(this.getNode(), `Booking conflict: ${message}`, { itemIndex: i });
            }
          });
        } else if (operation === 'confirm') {
          responseData = await createApiAction.call(this, {
            itemIndex: i,
            baseUrl,
            endpoint: () => {
              const bookingId = (this.getNodeParameter('bookingId', i) as string).trim();
              if (!bookingId) throw new NodeOperationError(this.getNode(), 'Booking ID is required.', { itemIndex: i });
              return `/v1/bookings/${bookingId}/confirm`;
            },
            prepareRequest: undefined,
            handleSuccess: (data, requestId) => ({
              bookingId: data.data?.id || data.id,
              status: data.data?.status || data.status,
              resourceId: data.data?.resourceId || data.resourceId,
              startAt: data.data?.startAt || data.startAt,
              endAt: data.data?.endAt || data.endAt,
              confirmedAt: data.data?.confirmedAt || data.confirmedAt,
              requestId
            })
          });
        } else if (operation === 'cancel') {
          responseData = await createApiAction.call(this, {
            itemIndex: i,
            baseUrl,
            endpoint: () => {
              const bookingId = (this.getNodeParameter('bookingId', i) as string).trim();
              if (!bookingId) throw new NodeOperationError(this.getNode(), 'Booking ID is required.', { itemIndex: i });
              return `/v1/bookings/${bookingId}/cancel`;
            },
            prepareRequest: undefined,
            handleSuccess: (data, requestId) => ({
              bookingId: data.data?.id || data.id,
              status: data.data?.status || data.status,
              resourceId: data.data?.resourceId || data.resourceId,
              startAt: data.data?.startAt || data.startAt,
              endAt: data.data?.endAt || data.endAt,
              cancelledAt: data.data?.cancelledAt || data.cancelledAt,
              requestId
            })
          });
        }

        if (responseData) {
          returnData.push({ json: responseData });
        }
      } catch (error) {
        if (this.continueOnFail()) {
          returnData.push({ json: { error: (error as Error).message } });
          continue;
        }
        if (error instanceof NodeOperationError) {
          throw error;
        }
        throw new NodeOperationError(this.getNode(), `Request failed: ${(error as Error).message}`, { itemIndex: i });
      }
    }

    return [returnData];
  }
}

interface ApiActionConfig {
  itemIndex: number;
  baseUrl: string;
  method?: 'POST' | 'DELETE' | 'PATCH' | 'PUT';
  endpoint: string | (() => string);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prepareRequest?: () => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleSuccess: (data: any, requestId: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handle409?: (data: any, requestId: string) => any;
}

async function createApiAction(this: IExecuteFunctions, config: ApiActionConfig) {
  const { itemIndex, baseUrl, method = 'POST', prepareRequest, handleSuccess, handle409 } = config;

  // Get endpoint
  const endpoint = typeof config.endpoint === 'function' ? config.endpoint() : config.endpoint;

  // Prepare request body (optional)
  const body = prepareRequest ? prepareRequest() : undefined;

  // Make request
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const requestOptions: any = {
    method,
    url: `${baseUrl}${endpoint}`,
    json: true,
    returnFullResponse: true,
    ignoreHttpStatusErrors: true
  };

  // Only add body if it exists
  if (body !== undefined) {
    requestOptions.body = body;
  }

  const response = await this.helpers.httpRequestWithAuthentication.call(this, 'floydApi', requestOptions);

  const requestId = response.headers?.['x-floyd-request-id'] ?? '';
  const statusCode = response.statusCode;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = response.body as any;

  // Handle response
  if (statusCode >= 200 && statusCode < 300) {
    return handleSuccess(data, requestId);
  }

  if (statusCode === 404) {
    throw new NodeOperationError(this.getNode(), 'Booking not found', { itemIndex });
  }

  if (statusCode === 409) {
    if (handle409) {
      return handle409(data, requestId);
    }
    const message = data.error?.message || data.message || 'Cannot modify booking';
    throw new NodeOperationError(this.getNode(), `Operation failed: ${message}`, { itemIndex });
  }

  const errorMessage = data?.error?.message || data?.message || `HTTP ${statusCode}`;
  throw new NodeOperationError(this.getNode(), `Floyd API error: ${errorMessage}`, { itemIndex });
}
