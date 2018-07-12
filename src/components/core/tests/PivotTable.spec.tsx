import * as React from 'react';
import { mount } from 'enzyme';
import noop = require('lodash/noop');

import { PivotTable, PivotTableInner, getGridDataSource } from '../PivotTable';
import { oneMeasureDataSource } from '../../tests/mocks';
import { pivotTableWithColumnAndRowAttributes } from '../../../../stories/test_data/fixtures';

describe('PivotTable', () => {
    it('should render PivotTableInner', () => {
        const wrapper = mount(
            <PivotTable
                dataSource={oneMeasureDataSource}
                getPage={noop}
            />
        );
        expect(wrapper.find(PivotTableInner).length).toBe(1);
    });
    describe('getGridDataSource', () => {
        it('should return AGGrid dataSource that calls getPage, successCallback and onSuccess', async () => {
            const resultSpec = pivotTableWithColumnAndRowAttributes.executionRequest.resultSpec;
            const getPage = jest.fn().mockReturnValue(Promise.resolve(pivotTableWithColumnAndRowAttributes));
            const startRow = 0;
            const endRow = 0;
            const successCallback = jest.fn();
            const onSuccess = jest.fn();

            const gridDataSource = getGridDataSource(resultSpec, getPage, onSuccess);
            await gridDataSource.getRows({ startRow, endRow, successCallback });
            expect(getPage).toHaveBeenCalledWith(resultSpec, [0, undefined], [0, undefined]);
            expect(successCallback.mock.calls[0]).toMatchSnapshot();
            expect(onSuccess.mock.calls[0]).toMatchSnapshot();
        });
    });
});
