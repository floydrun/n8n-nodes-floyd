import { IAuthenticateGeneric, ICredentialType, INodeProperties } from 'n8n-workflow';

export class FloydApi implements ICredentialType {
  name = 'floydApi';
  displayName = 'Floyd API';
  documentationUrl = 'https://docs.floyd.run';

  properties: INodeProperties[] = [
    {
      displayName: 'API Key',
      name: 'apiKey',
      type: 'string',
      typeOptions: {
        password: true
      },
      default: '',
      required: true,
      description: 'Your Floyd API key. Find it at console.floyd.run → Organization → API Keys.'
    },
    {
      displayName: 'Show Advanced Options',
      name: 'showAdvanced',
      type: 'boolean',
      default: false
    },
    {
      displayName: 'Base URL',
      name: 'baseUrl',
      type: 'string',
      default: 'https://api.floyd.run',
      required: false,
      description: 'Change only for staging/self-hosted.',
      displayOptions: {
        show: {
          showAdvanced: [true]
        }
      }
    }
  ];

  authenticate: IAuthenticateGeneric = {
    type: 'generic',
    properties: {
      headers: {
        Authorization: '={{"Bearer " + $credentials.apiKey}}'
      }
    }
  };
}

export const credentialType = FloydApi;
