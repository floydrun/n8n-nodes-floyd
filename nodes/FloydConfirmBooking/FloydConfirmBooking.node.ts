import {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  NodeOperationError
} from 'n8n-workflow';

export class FloydConfirmBooking implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Floyd Confirm Booking',
    name: 'floydConfirmBooking',
    icon: 'file:../../assets/icons/floyd-icon.svg',
    group: ['transform'],
    version: 1,
    subtitle: 'Finalize a booking',
    description:
      'Confirm a pending hold to finalize the booking. Converts the hold to a confirmed booking and clears the expiration.',
    defaults: {
      name: 'Floyd Confirm Booking'
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
        displayName: 'Booking ID',
        name: 'bookingId',
        type: 'string',
        required: true,
        default: '',
        placeholder: 'bk_abc123',
        description: 'The booking ID from Floyd Create Hold'
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
        const bookingId = (this.getNodeParameter('bookingId', i) as string).trim();

        if (!bookingId) {
          throw new NodeOperationError(this.getNode(), 'Booking ID is required.', { itemIndex: i });
        }

        const response = await this.helpers.httpRequestWithAuthentication.call(this, 'floydApi', {
          method: 'POST',
          url: `${baseUrl}/v1/bookings/${bookingId}/confirm`,
          headers: {
            'Content-Type': 'application/json'
          },
          body: {},
          json: true,
          returnFullResponse: true,
          ignoreHttpStatusErrors: true
        });

        const requestId = response.headers?.['x-floyd-request-id'] ?? '';
        const statusCode = response.statusCode;
        const responseBody = response.body;

        // Success
        if (statusCode >= 200 && statusCode < 300) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const data = responseBody as any;
          returnData.push({
            json: {
              bookingId: data.data?.id || data.id,
              status: data.data?.status || data.status,
              resourceId: data.data?.resourceId || data.resourceId,
              startAt: data.data?.startAt || data.startAt,
              endAt: data.data?.endAt || data.endAt,
              confirmedAt: data.data?.confirmedAt || data.confirmedAt,
              requestId
            }
          });
          continue;
        }

        // Not Found (404)
        if (statusCode === 404) {
          throw new NodeOperationError(this.getNode(), `Booking not found: ${bookingId}`, { itemIndex: i });
        }

        // Conflict (409) - Hold expired or already confirmed
        if (statusCode === 409) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const data = responseBody as any;
          const message = data.error?.message || data.message || 'Cannot confirm booking';
          throw new NodeOperationError(this.getNode(), `Confirm failed: ${message}`, { itemIndex: i });
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

export const nodeClass = FloydConfirmBooking;
