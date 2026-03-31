export interface ResultDto {
  message: string;
  success: boolean;
}

export interface MessageDto {
  content: string;
  uuid?: string | null;
  name?: string;
  role_type: 'user' | 'assistant' | 'system';
  role?: string | null;
  timestamp?: string;
  source_description?: string;
}

export interface AddMessagesRequestDto {
  group_id: string;
  messages: MessageDto[];
}

export interface AddEntityNodeRequestDto {
  uuid: string;
  group_id: string;
  name: string;
  summary?: string;
}

export interface SearchQueryDto {
  group_ids?: string[] | null;
  query: string;
  max_facts?: number;
  center_node_uuid?: string | null;
  search_filter?: SearchFilterDto | null;
}

export interface DateFilterDto {
  date?: string | null;
  comparison_operator:
    | '='
    | '<>'
    | '>'
    | '<'
    | '>='
    | '<='
    | 'IS NULL'
    | 'IS NOT NULL';
}

export interface PropertyFilterDto {
  property_name: string;
  property_value?: string | number | null;
  comparison_operator:
    | '='
    | '<>'
    | '>'
    | '<'
    | '>='
    | '<='
    | 'IS NULL'
    | 'IS NOT NULL';
}

export interface SearchFilterDto {
  node_labels?: string[] | null;
  edge_types?: string[] | null;
  valid_at?: DateFilterDto[][] | null;
  invalid_at?: DateFilterDto[][] | null;
  created_at?: DateFilterDto[][] | null;
  expired_at?: DateFilterDto[][] | null;
  edge_uuids?: string[] | null;
  property_filters?: PropertyFilterDto[] | null;
}

export interface FactResultDto {
  uuid: string;
  name: string;
  fact: string;
  valid_at: string | null;
  invalid_at: string | null;
  created_at: string;
  expired_at: string | null;
}

export interface SearchResultsDto {
  facts: FactResultDto[];
}

export interface GetMemoryRequestDto {
  group_id: string;
  max_facts?: number;
  center_node_uuid?: string | null;
  messages: MessageDto[];
}

export interface GetMemoryResponseDto {
  facts: FactResultDto[];
}
