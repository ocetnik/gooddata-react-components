// (C) 2007-2018 GoodData Corporation
import * as React from 'react';
import { AgGridReact } from 'ag-grid-react';
import * as classNames from 'classnames';
import noop = require('lodash/noop');
import get = require('lodash/get');
import isEqual = require('lodash/isEqual');
import { AFM, Execution } from '@gooddata/typings';
import {
    ColDef,
    IDatasource,
    IGetRowsParams,
    GridApi,
    GridReadyEvent,
    ICellRendererParams,
    GridOptions
} from 'ag-grid';
import { CellClassParams } from 'ag-grid/dist/lib/entities/colDef'; // this is not exported from ag-grid index

import { visualizationIsBetaWarning } from '../../helpers/utils';

import {
    executionToAGGridAdapter,
    ROW_ATTRIBUTE_COLUMN,
    COLUMN_ATTRIBUTE_COLUMN,
    MEASURE_COLUMN,
    FIELD_SEPARATOR,
    ID_SEPARATOR,
    ROW_TOTAL,
    assortDimensionHeaders
} from '../../helpers/agGrid';

import { LoadingComponent } from '../simple/LoadingComponent';
import { IDataSourceProviderInjectedProps } from '../afm/DataSourceProvider';

import {
    visualizationLoadingHOC,
    ILoadingInjectedProps,
    commonDefaultProps
} from './base/VisualizationLoadingHOC';

import { ICommonChartProps } from './base/BaseChart';
import { IDataSource } from '../../interfaces/DataSource';
import { BaseVisualization } from './base/BaseVisualization';
import PivotHeader from './PivotTableHeader';

import { getCellClassNames } from '../visualizations/table/utils/cell';

import {
    IDrillableItem,
    IDrillEvent,
    IDrillEventIntersectionElement,
    isDrillableItemLocalId,
    IDrillItem
} from '../../interfaces/DrillEvents';

import {
    isDrillable,
    getMeasureUriOrIdentifier
} from '../visualizations/utils/drilldownEventing';

import { VisualizationTypes } from '../../constants/visualizationTypes';
import { IColumnDefOptions, IGridCellEvent, IGridHeader, IGridRow } from '../../interfaces/AGGrid';
import * as invariant from 'invariant';

import InjectedIntlProps = ReactIntl.InjectedIntlProps;
import InjectedIntl = ReactIntl.InjectedIntl;
import { AVAILABLE_TOTALS } from '../visualizations/table/totals/utils';

export interface IPivotTableProps extends ICommonChartProps {
    resultSpec?: AFM.IResultSpec;
    dataSource: IDataSource;
    totalsEditAllowed?: boolean;
    onSortChange?: (sortBy: AFM.SortItem[]) => AFM.SortItem[];
    getPage: IGetPage;
    pageSize?: number;
}

export interface IPivotTableState {
    columnDefs: ColDef[];
    // rowData an an array of different objects depending on the content of the table.
    rowData: IGridRow[];
    execution: Execution.IExecutionResponses;
}

export type IGetPage = (
    resultSpec: AFM.IResultSpec,
    limit: number[],
    offset: number[]
) => Promise<Execution.IExecutionResponses | null>;

interface ICustomGridOptions extends GridOptions {
    enableMenu?: boolean;
}

const AG_NUMERIC_CELL_CLASSNAME = 'ag-numeric-cell';
const AG_NUMERIC_HEADER_CLASSNAME = 'ag-numeric-header';

export const getDrillRowData = (leafColumnDefs: ColDef[], rowData: {[key: string]: any}) => {
    return leafColumnDefs.reduce((drillRow, colDef: ColDef) => {
        const { type } = colDef;
        // colDef without field is a utility column (e.g. top column label)
        if (colDef.field) {
            if (type === MEASURE_COLUMN) {
                return [...drillRow, rowData[colDef.field]];
            }
            const drillItem = get<any, IDrillableItem>(rowData, ['drillItemMap', colDef.field]);
            if (drillItem && (type === COLUMN_ATTRIBUTE_COLUMN || type === ROW_ATTRIBUTE_COLUMN)) {
                return [...drillRow, {
                    id: drillItem.uri.split('?id=')[1],
                    title: rowData[colDef.field]
                }];
            }
        }
        return drillRow;
    }, []);
};

export const indexOfTreeNode = (
    node: any,
    tree: any,
    matchNode = (nodeA: any, nodeB: any) => (nodeA === nodeB),
    getChildren = (node: any) => ((node && node.children) || []),
    indexes: number[] = []
): number[] => {
    const nodes = Array.isArray(tree) ? [...tree] : [tree];
    for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++) {
        const currentNode = nodes[nodeIndex];
        // match current node
        if (matchNode(currentNode, node)) {
            return [...indexes, nodeIndex];
        }
        // check children
        const childrenMatchIndexes = indexOfTreeNode(
            node,
            getChildren(currentNode),
            matchNode,
            getChildren,
            [...indexes, nodeIndex]
        );
        if (childrenMatchIndexes !== null) {
            return childrenMatchIndexes;
        }
    }
    return null;
};

export const getTreeLeaves = (tree: any, getChildren = (node: any) => node && node.children) => {
    const leaves = [];
    const nodes = Array.isArray(tree) ? [...tree] : [tree];
    let node;
    let children;
    while (
        // tslint:disable-next-line:no-conditional-assignment ban-comma-operator
        node = nodes.shift(), children = getChildren(node),
        ((children && children.length) || (leaves.push(node) && nodes.length))
    ) {
        if (children) {
            nodes.push(...children);
        }
    }
    return leaves;
};

export const getSortItemByField = (
    execution: Execution.IExecutionResponses,
    colId: string,
    direction: 'asc' | 'desc'
) => {
    const dimensions: Execution.IResultDimension[] = execution.executionResponse.dimensions;
    // sorting on column attribute measures will return colId like these 'a_2009_4-a_2071_12-m_3', 'a_2009'
    // we need the last field 'm_3' or 'a_2009'
    const fields = colId.split(FIELD_SEPARATOR);
    const lastField = fields[fields.length - 1];
    const [fieldType, fieldId]: any = lastField.split(ID_SEPARATOR);
    invariant(fieldType, `could not determine field type from ${colId}`);
    invariant(fieldId, `could not determine field id from ${colId}`);

    const { attributeHeaders, measureHeaderItems } = assortDimensionHeaders(dimensions);

    if (fieldType === 'a') {
        for (const header of attributeHeaders) {
            if (header.attributeHeader.uri.split('/').reverse()[0] === fieldId) {
                return {
                    attributeSortItem: {
                        direction,
                        attributeIdentifier: header.attributeHeader.localIdentifier
                    }
                };
            }
        }
    } else if (fieldType === 'm') {
        const headerItem = measureHeaderItems[parseInt(fieldId, 10)];
        const attributeLocators = fields.slice(0, -1).map((attributeField: string) => {
            const [, attributeId, attributeValueId] = attributeField.match(/a_(\d*)_(\d*)/);
            const attributeHeaderMatch = attributeHeaders.find((attributeHeader: Execution.IAttributeHeader) => {
                return attributeHeader.attributeHeader.formOf.uri.split('/').reverse()[0] === attributeId;
            });
            invariant(attributeHeaderMatch, `Could not find matching attribute header to field ${attributeField}`);
            return {
                attributeLocatorItem: {
                    attributeIdentifier: attributeHeaderMatch.attributeHeader.localIdentifier,
                    element: `${attributeHeaderMatch.attributeHeader.formOf.uri}/elements?id=${attributeValueId}`
                }
            };
        });
        return {
            measureSortItem: {
                direction,
                // Type: LocatorItem[]
                locators: [
                    ...attributeLocators,
                    {
                        measureLocatorItem: {
                            measureIdentifier: headerItem.measureHeaderItem.localIdentifier
                        }
                    }
                ]
            }
        };
    }
    invariant(false, `could not find header matching ${colId}`);
};

export const getGridDataSource = (
    resultSpec: AFM.IResultSpec,
    getPage: IGetPage,
    getExecution: () => Execution.IExecutionResponses,
    onSuccess: (execution: Execution.IExecutionResponses, columnDefs: IGridHeader[]) => void,
    getGridApi: () => any,
    intl: InjectedIntl,
    columnDefOptions: IColumnDefOptions = {}
): IDatasource => ({
    getRows: ({ startRow, endRow, successCallback, sortModel }: IGetRowsParams) => {
        const execution = getExecution();
        // If execution is null, this means this is a fresh dataSource and we should ignore current sortModel
        const resultSpecWithSorting = (sortModel.length > 0 && execution)
            ? {
                ...resultSpec,
                // override sorting based on sortModel
                sorts: sortModel.map((sortModelItem: any) => {
                    // get attribute or measure by field
                    const { colId, sort } = sortModelItem;
                    const sortHeader = getSortItemByField(execution, colId, sort);
                    invariant(sortHeader, `unable to find sort item by field ${colId}`);
                    return sortHeader;
                })
            }
            : resultSpec;

        const pagePromise = getPage(
            resultSpecWithSorting,
            // column limit defaults to SERVERSIDE_COLUMN_LIMIT (1000), because 1000 columns is hopefully enough.
            [endRow - startRow, undefined],
            // column offset defaults to 0, because we do not support horizontal paging yet
            [startRow, undefined]
        );
        return pagePromise
            .then(
                (execution: Execution.IExecutionResponses | null) => {
                    if (!execution) {
                        return null;
                    }
                    const { columnDefs, rowData, rowTotals } = executionToAGGridAdapter(
                        execution,
                        resultSpecWithSorting,
                        intl,
                        {
                            addLoadingRenderer: 'loadingRenderer',
                            columnDefOptions
                        }
                    );
                    const { offset, count, total } = execution.executionResult.paging;
                    // Backend returns incorrectly total: [1, N], when count: [0, N] and offset: [0, N]
                    const lastRow = offset[0] === 0 && count[0] === 0 ? 0 : total[0];
                    onSuccess(execution, columnDefs);
                    successCallback(rowData, lastRow);
                    // set totals
                    getGridApi().setPinnedBottomRowData(rowTotals);

                    return execution;
                }
            );
    }
});

export const RowLoadingElement = (props: ICellRendererParams) =>
    (props.node.id !== undefined || props.node.rowPinned
        ? <span>{props.data[props.colDef.field]}</span>
        : <LoadingComponent width={36} imageHeight={8} height={26} speed={2} />);

export const getDrillIntersection = (
    drillItems: IDrillItem[],
    afm: AFM.IAfm
): IDrillEventIntersectionElement[] => {
    // Drilling needs refactoring: all '' should be replaced by null (breaking change)
    // intersection consists of
        // 0..1 measure
        // 0..1 row attribute and row attribute value
        // 0..n column attribute and column attribute values
    return drillItems.map((drillItem: IDrillItem) => {
        const { identifier, uri, title } = drillItem;
        return {
            // id: Measure localIdentifier or attribute identifier
            // Properties default to empty strings to maintain compatibility
            id: isDrillableItemLocalId(drillItem) ? drillItem.localIdentifier : (identifier || ''),
            title,
            header: {
                uri: isDrillableItemLocalId(drillItem)
                    ? get(
                        getMeasureUriOrIdentifier(afm, drillItem.localIdentifier),
                        'uri',
                        uri || ''
                    ) : uri || '',
                identifier: isDrillableItemLocalId(drillItem)
                    ? get(
                        getMeasureUriOrIdentifier(afm, drillItem.localIdentifier),
                        'identifier',
                        identifier || ''
                    ) : identifier || ''
            }
        };
    });
};

export class PivotTableInner extends
        BaseVisualization<
            IPivotTableProps & ILoadingInjectedProps & IDataSourceProviderInjectedProps & InjectedIntlProps,
            IPivotTableState
        > {
    public static defaultProps: Partial<IPivotTableProps & ILoadingInjectedProps & IDataSourceProviderInjectedProps> = {
        ...commonDefaultProps,
        onDataTooLarge: noop,
        pageSize: 100
    };

    private gridDataSource: IDatasource;
    private gridApi: GridApi;

    constructor(props: IPivotTableProps & ILoadingInjectedProps & IDataSourceProviderInjectedProps) {
        super(props);
        this.state = {
            columnDefs: [],
            rowData: [],
            execution: null
        };
        this.gridDataSource = null;
        this.gridApi = null;
        visualizationIsBetaWarning();
    }

    public componentWillMount() {
        const { resultSpec, getPage } = this.props;
        this.createDataSource(resultSpec, getPage);
    }

    public componentWillReceiveProps(
        nextProps: IPivotTableProps & ILoadingInjectedProps & IDataSourceProviderInjectedProps
    ) {
        const propsRequiringNewDataSource = [
            'afm',
            'resultSpec',
            'getPage',
            // drillable items need fresh execution because drillable context for row attribute is kept in rowData
            // It could be refactored to assign drillability without execution,
            // but it would suffer a significant performance hit
            'drillableItems'
        ];

        if (propsRequiringNewDataSource.some(propKey => !isEqual(this.props[propKey], nextProps[propKey]))) {
            this.createDataSource(nextProps.resultSpec, nextProps.getPage);
            this.setGridDataSource();
        }
    }

    /**
     * getCellClass returns class for drillable cells. (maybe format in the future as well)
     */
    public getCellClass = (classList: string) => (cellClassParams: CellClassParams): string => {
        const { drillableItems, dataSource } = this.props;
        const { rowIndex } = cellClassParams;
        const colDef = cellClassParams.colDef as IGridHeader;
        // return none if no drillableItems are specified

        const afm: AFM.IAfm = dataSource.getAfm();

        let hasDrillableHeader = false;
        const isRowTotal = get(cellClassParams, ['data', 'type', ROW_TOTAL]);
        if (drillableItems.length !== 0 && !isRowTotal) {
            const rowDrillItem =
                get<CellClassParams, IDrillableItem>(cellClassParams, ['data', 'drillItemMap', colDef.field]);
            const drillItems = rowDrillItem ? [...colDef.drillItems, rowDrillItem] : colDef.drillItems;
            hasDrillableHeader = drillItems
                .some(
                    (drillItem: IDrillItem) => isDrillable(drillableItems, drillItem, afm)
                );
        }

        const className = classNames(
            classList,
            getCellClassNames(rowIndex, colDef.index, hasDrillableHeader),
            colDef.index !== undefined ? `gd-column-index-${colDef.index}` : null,
            colDef.measureIndex !== undefined ? `gd-column-measure-${colDef.measureIndex}` : null,
            isRowTotal ? 'gd-row-total' : null
        );
        return className;
    }

    public getHeaderClass = (classList: string) => (headerClassParams: any): string => {
        const colDef: ColDef = headerClassParams.colDef;
        const { field } = colDef;
        const treeIndexes = colDef ? indexOfTreeNode(
            colDef,
            this.state.columnDefs,
            (nodeA, nodeB) => nodeA.field !== undefined && nodeA.field === nodeB.field
        ) : null;
        const colGroupIndex = treeIndexes
            ? treeIndexes[treeIndexes.length - 1]
            : null;
        const isFirstColumn = treeIndexes !== null && !treeIndexes.some(index => index !== 0);
        const className = classNames(
            classList,
            'gd-column-group-header',
            colGroupIndex !== null ? `gd-column-group-header-${colGroupIndex}` : null,
            !field ? 'gd-column-group-header--empty' : null,
            isFirstColumn ? 'gd-column-group-header--first' : null
        );
        return className;
    }

    public getExecution = () => {
        return this.state.execution;
    }

    public createDataSource(resultSpec: AFM.IResultSpec, getPage: IGetPage) {
        const onSuccess = (execution: Execution.IExecutionResponses, columnDefs: IGridHeader[]) => {
            if (!isEqual(columnDefs, this.state.columnDefs)) {
                this.setState({
                    columnDefs
                });
            }
            if (!isEqual(execution, this.state.execution)) {
                this.setState({
                    execution
                });
            }
        };
        this.gridDataSource = getGridDataSource(
            resultSpec,
            getPage,
            this.getExecution,
            onSuccess,
            this.getGridApi,
            this.props.intl,
            {}
        );
    }

    public getGridApi = () => this.gridApi;

    public onGridReady = (params: GridReadyEvent) => {
        this.gridApi = params.api;
        this.setGridDataSource();
    }

    public setGridDataSource() {
        this.setState({ execution: null });
        this.gridApi.setDatasource(this.gridDataSource);
    }

    public cellClicked = (cellEvent: IGridCellEvent) => {
        const { drillableItems, onFiredDrillEvent } = this.props;
        const { columnDefs } = this.state;
        const afm: AFM.IAfm = this.props.dataSource.getAfm();

        const { colDef, rowIndex } = cellEvent;
        // totals do not have drillItemMap
        const isRowTotal = get<IGridCellEvent, string>(cellEvent, ['data', 'type', ROW_TOTAL]);
        const rowDrillItem = get<IGridCellEvent, IDrillableItem>(cellEvent, ['data', 'drillItemMap', colDef.field]);
        const drillItems = rowDrillItem ? [...colDef.drillItems, rowDrillItem] : colDef.drillItems;
        const drillableHeaders = drillItems
            .filter(
                (drillItem: IDrillItem) => isDrillable(drillableItems, drillItem, afm)
            );
        if (isRowTotal || drillableHeaders.length === 0) {
            return false;
        }

        const leafColumnDefs = getTreeLeaves(columnDefs);
        const drillEvent: IDrillEvent = {
            executionContext: afm,
            drillContext: {
                type: VisualizationTypes.TABLE,
                element: 'cell',
                columnIndex: leafColumnDefs.findIndex(gridHeader => gridHeader.field === colDef.field),
                rowIndex,
                row: getDrillRowData(leafColumnDefs, cellEvent.data),
                intersection: getDrillIntersection(drillItems, afm),
                value: cellEvent.value ? cellEvent.value.toString() : null
            }
        };

        if (onFiredDrillEvent(drillEvent)) {
            return true;
        }
        return false;
    }

    public renderVisualization() {
        const { columnDefs, rowData } = this.state;
        const { pageSize } = this.props;

        const gridOptions: ICustomGridOptions = {
            // Initial data
            columnDefs,
            rowData,

            defaultColDef: {
                cellClass: this.getCellClass(null),
                headerComponentParams: {
                    enableMenu: false
                }
            },
            defaultColGroupDef: {
                headerClass: this.getHeaderClass(null),
                children: []
            },
            onCellClicked: this.cellClicked,

            // Basic options
            suppressMovableColumns: true,
            enableFilter: false,
            enableColResize: true,
            enableServerSideSorting: true,

            // infinite scrolling model
            rowModelType: 'infinite',
            paginationPageSize: pageSize,
            cacheOverflowSize: pageSize,
            cacheBlockSize: pageSize,
            maxConcurrentDatasourceRequests: 1,
            infiniteInitialRowCount: pageSize,
            maxBlocksInCache: 10,
            onGridReady: this.onGridReady,

            // this provides persistent row selection (if enabled)
            getRowNodeId: (item) => {
                return item.drillItemMap
                    ? Object.keys(item.drillItemMap).map(
                        key => `${key}${ID_SEPARATOR}${item.drillItemMap[key].uri.split('elements?id=').reverse()[0]}`
                    ).join(FIELD_SEPARATOR)
                    : undefined;
            },

            // Column types
            columnTypes: {
                [ROW_ATTRIBUTE_COLUMN]: {
                    cellClass: this.getCellClass('gd-row-attribute-column'),
                    headerClass: this.getHeaderClass('gd-row-attribute-column-header'),
                    colSpan: (params: any) => {
                        if (
                            // params.data is undefined when rows are in loading state
                            params.data &&
                            params.data.colSpan &&
                            // TODO we need to provide types of aggregation (constants)
                            AVAILABLE_TOTALS.find(item => item === params.data[params.data.colSpan.headerKey])
                        ) {
                            return params.data.colSpan.count;
                        }
                        return 1;
                    }
                },
                [COLUMN_ATTRIBUTE_COLUMN]: {
                    cellClass: this.getCellClass('gd-column-attribute-column'),
                    headerClass: this.getHeaderClass('gd-column-attribute-column-header')
                },
                [MEASURE_COLUMN]: {
                    cellClass: this.getCellClass(classNames(
                        AG_NUMERIC_CELL_CLASSNAME, 'gd-measure-column')),
                    headerClass: this.getHeaderClass(classNames(
                        AG_NUMERIC_HEADER_CLASSNAME, 'gd-measure-column-header'))
                }
            },

            // Custom renderers
            frameworkComponents: {
                // any is needed here because of incompatible types with AgGridReact types
                loadingRenderer: RowLoadingElement as any, // loading indicator
                agColumnHeader: PivotHeader as any
            }
        };

        // columnDefs are loaded with first page request. Show overlay loading before first page is available.
        const tableLoadingOverlay = columnDefs.length === 0 ? (
            <div
                style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: 0,
                    bottom: 0
                }}
            >
                <LoadingComponent />
            </div>
        ) : null;

        return (
            <div
                key="PivotTable"
                className="ag-theme-balham s-pivot-table"
                style={{ height: '100%', position: 'relative' }}
            >
                {tableLoadingOverlay}
                <AgGridReact
                    key="PivotTable"
                    {...gridOptions}
                />
            </div>
        );
    }
}

export const PivotTable = visualizationLoadingHOC(PivotTableInner, false);
