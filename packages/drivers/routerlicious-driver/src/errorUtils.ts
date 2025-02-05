/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DriverError } from "@fluidframework/driver-definitions";
import {
    NonRetryableError,
    GenericNetworkError,
    createGenericNetworkError,
    AuthorizationError,
} from "@fluidframework/driver-utils";
import { pkgVersion as driverVersion } from "./packageVersion";

export enum R11sErrorType {
    fileNotFoundOrAccessDeniedError = "fileNotFoundOrAccessDeniedError",
}

/**
 * Interface for error responses for the WebSocket connection
 */
export interface IR11sSocketError {
    /**
     * An error code number for the error that occurred.
     * It will be a valid HTTP status code.
     */
    code: number;

    /**
     * A message about the error that occurred for debugging / logging purposes.
     * This should not be displayed to the user directly.
     */
    message: string;

    /**
     * Optional Retry-After time in seconds.
     * The client should wait this many seconds before retrying its request.
     */
    retryAfterMs?: number;
}

export interface IR11sError {
    readonly errorType: R11sErrorType;
    readonly message: string;
    canRetry: boolean;
}

export type R11sError = DriverError | IR11sError;

export function createR11sNetworkError(
    fluidErrorCode: string,
    errorMessage: string,
    statusCode?: number,
    retryAfterMs?: number,
): R11sError {
    const props = { statusCode, driverVersion };
    switch (statusCode) {
        case undefined:
            // If a service is temporarily down or a browser resource limit is reached, RestWrapper will throw
            // a network error with no status code (e.g. err:ERR_CONN_REFUSED or err:ERR_FAILED) and
            // the error message will start with NetworkError as defined in restWrapper.ts
            return new GenericNetworkError(
                fluidErrorCode, errorMessage, errorMessage.startsWith("NetworkError"), props);
        case 401:
        case 403:
            return new AuthorizationError(
                fluidErrorCode, errorMessage, undefined, undefined, props);
        case 404:
            const errorType = R11sErrorType.fileNotFoundOrAccessDeniedError;
            return new NonRetryableError(fluidErrorCode, errorMessage, errorType, props);
        case 429:
            return createGenericNetworkError(
                fluidErrorCode, errorMessage, { canRetry: true, retryAfterMs }, props);
        case 500:
            return new GenericNetworkError(fluidErrorCode, errorMessage, true, props);
        default:
            const retryInfo = { canRetry: retryAfterMs !== undefined, retryAfterMs };
            return createGenericNetworkError(fluidErrorCode, errorMessage, retryInfo, props);
    }
}

export function throwR11sNetworkError(
    fluidErrorCode: string,
    errorMessage: string,
    statusCode?: number,
    retryAfterMs?: number,
): never {
    const networkError = createR11sNetworkError(
        fluidErrorCode,
        errorMessage,
        statusCode,
        retryAfterMs);

    // eslint-disable-next-line @typescript-eslint/no-throw-literal
    throw networkError;
}

/**
 * Returns network error based on error object from R11s socket (IR11sSocketError)
 */
export function errorObjectFromSocketError(socketError: IR11sSocketError, handler: string): R11sError {
    const message = `R11sSocketError (${handler}): ${socketError.message}`;
    return createR11sNetworkError(
        "r11sSocketError",
        message,
        socketError.code,
        socketError.retryAfterMs,
    );
}
