import {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  NodeOperationError
} from 'n8n-workflow';

export class FloydCreateHold implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Floyd Create Hold',
    name: 'floydCreateHold',
    icon: 'file:icon.svg',
    group: ['transform'],
    version: 1,
    subtitle: 'Reserve a time slot',
    description:
      'Create an atomic hold on a time slot. Only one workflow can win; conflicts return explicit 409 outcomes.',
    defaults: {
      name: 'Floyd Create Hold'
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
        displayName: 'Resource ID',
        name: 'resourceId',
        type: 'string',
        required: true,
        default: '',
        description: 'The resource to book. Find it at console.floyd.run → Resources.'
      },
      {
        displayName: 'Start Time',
        name: 'startAt',
        type: 'dateTime',
        required: true,
        default: '',
        description: 'Slot start time (ISO 8601 format)'
      },
      {
        displayName: 'End Time',
        name: 'endAt',
        type: 'dateTime',
        required: true,
        default: '',
        description: 'Slot end time (ISO 8601 format)'
      },
      {
        displayName: 'Hold Duration (seconds)',
        name: 'ttlSeconds',
        type: 'number',
        default: 300,
        description: 'How long the hold lasts before expiring (default: 5 minutes)'
      },
      {
        displayName: 'Idempotency Key',
        name: 'idempotencyKey',
        type: 'string',
        default: '',
        description: 'Optional key for retry-safe requests. Same key = same result.'
      },
      {
        displayName: 'Metadata',
        name: 'metadata',
        type: 'json',
        default: '{}',
        description: 'Arbitrary JSON payload (customer info, external refs, etc.)'
      },
      {
        displayName: 'Return Conflicts as Output',
        name: 'returnConflictsAsOutput',
        type: 'boolean',
        default: true,
        description: 'If ON, 409 conflicts become node output (branchable). If OFF, conflicts fail the workflow.'
      }
    ]
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    const credentials = await this.getCredentials('floydApi');
    const baseUrl = ((credentials.baseUrl as string) || 'https://api.floyd.run').replace(/\/$/, '');

    for (let i = 0; i < items.length; i++) {
      try {
        const resourceId = (this.getNodeParameter('resourceId', i) as string).trim();
        const startAt = this.getNodeParameter('startAt', i) as string;
        const endAt = this.getNodeParameter('endAt', i) as string;
        const ttlSeconds = this.getNodeParameter('ttlSeconds', i) as number;
        const idempotencyKey = this.getNodeParameter('idempotencyKey', i) as string;
        const metadataRaw = this.getNodeParameter('metadata', i) as string;
        const returnConflictsAsOutput = this.getNodeParameter('returnConflictsAsOutput', i) as boolean;

        if (!resourceId) {
          throw new NodeOperationError(this.getNode(), 'Resource ID is required.', { itemIndex: i });
        }

        if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
          throw new NodeOperationError(this.getNode(), 'Hold Duration must be greater than zero.', { itemIndex: i });
        }

        const startDate = new Date(startAt);
        const endDate = new Date(endAt);
        if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
          throw new NodeOperationError(this.getNode(), 'Start and end time must be valid dates.', { itemIndex: i });
        }

        if (endDate.getTime() <= startDate.getTime()) {
          throw new NodeOperationError(this.getNode(), 'End time must be after start time.', { itemIndex: i });
        }

        let metadata: unknown;
        try {
          metadata = typeof metadataRaw === 'string' ? JSON.parse(metadataRaw) : metadataRaw;
        } catch {
          throw new NodeOperationError(this.getNode(), 'Metadata must be valid JSON.', { itemIndex: i });
        }

        if (metadata !== undefined && (typeof metadata !== 'object' || metadata === null)) {
          throw new NodeOperationError(this.getNode(), 'Metadata must be an object.', { itemIndex: i });
        }

        const body: Record<string, unknown> = {
          resourceId,
          startAt,
          endAt,
          ttlSeconds,
          metadata
        };

        if (idempotencyKey) {
          body.idempotencyKey = idempotencyKey;
        }

        const response = await this.helpers.httpRequestWithAuthentication.call(this, 'floydApi', {
          method: 'POST',
          url: `${baseUrl}/v1/bookings`,
          headers: {
            'Content-Type': 'application/json'
          },
          body,
          json: true,
          returnFullResponse: true,
          ignoreHttpStatusErrors: true
        });

        const requestId = response.headers?.['x-floyd-request-id'] ?? '';
        const statusCode = response.statusCode;
        const responseBody = response.body;

        // Success
        if (statusCode >= 200 && statusCode < 300) {
          const data = responseBody as Record<string, any>;
          returnData.push({
            json: {
              bookingId: data.data?.id || data.id,
              status: data.data?.status || data.status,
              expiresAt: data.data?.expiresAt || data.expiresAt,
              requestId
            }
          });
          continue;
        }

        // Conflict (409)
        if (statusCode === 409) {
          const data = responseBody as Record<string, any>;
          const outcome = data.error?.outcome || data.outcome || 'conflict_overlap';
          const message = data.error?.message || data.message || 'Booking conflict';

          if (returnConflictsAsOutput) {
            returnData.push({
              json: {
                outcome,
                message,
                requestId
              }
            });
            continue;
          } else {
            throw new NodeOperationError(this.getNode(), `Booking conflict: ${message}`, { itemIndex: i });
          }
        }

        // Other errors
        const errorMessage = responseBody?.error?.message || responseBody?.message || `HTTP ${statusCode}`;
        throw new NodeOperationError(this.getNode(), `Floyd API error: ${errorMessage}`, { itemIndex: i });
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

export const nodeClass = FloydCreateHold;
