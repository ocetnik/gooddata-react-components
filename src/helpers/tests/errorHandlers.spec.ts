import { checkEmptyResult, convertErrors } from '../errorHandlers';
import { Execution } from '@gooddata/typings';
import { ErrorCodes as DataErrorCodes } from '@gooddata/data-layer';
import { emptyResponse } from '../../execution/fixtures/ExecuteAfm.fixtures';
import { ErrorCodes, ErrorStates } from '../../constants/errorStates';

describe('convertErrors', () => {
    it('should throw correct ErrorStates', () => {
        const error = new Error() as Execution.IError;
        error.response = { status: 0 };

        error.response.status = 204;
        expect(() => { convertErrors(error); }).toThrow(ErrorStates.NO_DATA);

        error.response.status = DataErrorCodes.HTTP_TOO_LARGE;
        expect(() => { convertErrors(error); }).toThrow(ErrorStates.DATA_TOO_LARGE_TO_COMPUTE);

        error.response.status = DataErrorCodes.HTTP_BAD_REQUEST;
        expect(() => { convertErrors(error); }).toThrow(ErrorStates.BAD_REQUEST);

        error.response.status = ErrorCodes.EMPTY_AFM;
        expect(() => { convertErrors(error); }).toThrow(ErrorStates.EMPTY_AFM);

        error.response.status = ErrorCodes.INVALID_BUCKETS;
        expect(() => { convertErrors(error); }).toThrow(ErrorStates.INVALID_BUCKETS);

        error.response.status = 0;
        expect(() => { convertErrors(error); }).toThrow(ErrorStates.UNKNOWN_ERROR);
    });
});

describe('checkEmptyResult', () => {
    it('should throw 204 on null executionResult', () => {
        expect.hasAssertions();

        try {
            checkEmptyResult(emptyResponse);
        } catch (obj) {
            expect(obj.response.status).toEqual(204);
        }
    });
});