import * as React from 'react';
import { VisualizationObject, AFM } from '@gooddata/typings';
import { omit } from 'lodash';
import { Subtract } from 'utility-types';

import { PivotTable as CorePivotTable } from './core/PivotTable';
import { dataSourceProvider } from './afm/DataSourceProvider';
import { ICommonChartProps } from './core/base/BaseChart';
import { convertBucketsToAFM } from '../helpers/conversion';
import { getPivotTableDimensions } from '../helpers/dimensions';
import { getResultSpec } from '../helpers/resultSpec';

import {
    ATTRIBUTE,
    MEASURES,
    ROWS,
    COLUMNS
 } from '../constants/bucketNames';

export interface ITableBucketProps {
    measures?: VisualizationObject.BucketItem[];
    attributes?: VisualizationObject.IVisualizationAttribute[];
    rows?: VisualizationObject.IVisualizationAttribute[];
    columns?: VisualizationObject.IVisualizationAttribute[];
    totals?: VisualizationObject.IVisualizationTotal[];
    totalsEditAllowed?: boolean;
    filters?: VisualizationObject.VisualizationObjectFilter[];
    sortBy?: AFM.SortItem[];
}

export interface ITableProps extends ICommonChartProps, ITableBucketProps {
    projectId: string;
    totalsEditAllowed?: boolean;
}

type ITableNonBucketProps = Subtract<ITableProps, ITableBucketProps>;
/**
 * TODO: Update link to documentation [PivotTable](http://sdk.gooddata.com/gooddata-ui/docs/table_component.html)
 * is a component with bucket props measures, attributes, totals, filters
 */
export function PivotTable(props: ITableProps): JSX.Element {

    const { measures, attributes, rows, columns, totals, sortBy, filters } = props;

    const buckets: VisualizationObject.IBucket[] = [
        {
            localIdentifier: MEASURES,
            items: measures || []
        },
        {
            localIdentifier: ATTRIBUTE,
            items: attributes || [],
            totals: totals || []
        },
        {
            localIdentifier: ROWS,
            items: rows || [],
            totals: totals || []
        },
        {
            localIdentifier: COLUMNS,
            items: columns || []
        }
    ];

    const afm = convertBucketsToAFM(buckets, filters);
    const resultSpec = getResultSpec(buckets, sortBy, getPivotTableDimensions);
    const getPivotTableDimensionsFromAfm = () => getPivotTableDimensions(buckets);
    const PivotTableWithDatasource = dataSourceProvider(CorePivotTable, getPivotTableDimensionsFromAfm, 'PivotTable');

    const newProps
        = omit<ITableProps, ITableNonBucketProps>(props,
            ['measures', 'attributes', 'rows', 'columns', 'totals', 'filters']);

    return (
        <PivotTableWithDatasource
            {...newProps}
            afm={afm}
            resultSpec={resultSpec}
        />
    );
}
