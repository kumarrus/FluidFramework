/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { AttachState } from "@fluidframework/container-definitions";
import { ContainerSchema } from "@fluidframework/fluid-static";
import { SharedMap, SharedDirectory } from "@fluidframework/map";
import { createAzureClient } from "./AzureClientFactory";
import { TestDataObject } from "./TestDataObject";
import { createAzureTokenProvider } from "./AzureTokenFactory";

describe("AzureClient", () => {
    const useAzure = process.env.FLUID_CLIENT === "azure";
    let client;
    const schema: ContainerSchema = {
        initialObjects: {
            map1: SharedMap,
        },
    };
    if (useAzure) {
        let azureTokenProvider;

        it("can create an Azure Token Provider", async () => {
            /**
             * Scenario: test if Azure Client token provider can be created
             *
             * Expected behavior: an error should not be thrown nor should a rejected promise
             * be returned.
             */
            assert.doesNotThrow(() => {
                azureTokenProvider = createAzureTokenProvider();
            },
            "azure token provider cannot be created",
            );
        });
        /**
         * Scenario: test if Azure Client can be created with token provider
         *
         * Expected behavior: an error should not be thrown nor should a rejected promise
         * be returned.
         */
        it("can create an azure client with live service", async () => {
            assert.doesNotThrow(() => {
                client = createAzureClient(azureTokenProvider);
            },
            "azure client cannot be created with live service",
            );
        });
    }
    else {
        /**
         * Scenario: test if Azure Client can be created with tinylicious
         *
         * Expected behavior: an error should not be thrown nor should a rejected promise
         * be returned.
         */
        it("can create an azure client with tinylicious", async () => {
            assert.doesNotThrow(() => {
                client = createAzureClient();
            },
            "azure client cannot be created with tinylicious",
            );
        });
    }

    /**
     * Scenario: test when Azure Client is instantiated correctly, it can create
     * a container successfully.
     *
     * Expected behavior: an error should not be thrown nor should a rejected promise
     * be returned.
     */
    it("can create new Azure Fluid Relay container successfully", async () => {
        const azureContainer = client.createContainer(schema);

        await assert.doesNotReject(
            azureContainer,
            () => true,
            "container cannot be created in Azure Fluid Relay",
        );
    });

    /**
     * Scenario: test if Azure Client can get an existing container.
     *
     * Expected behavior: an error should not be thrown nor should a rejected promise
     * be returned.
     */
    it("can retrieve existing Azure Fluid Relay container successfully", async () => {
        const { container: newContainer } = await client.createContainer(schema);
        const containerId = await newContainer.attach();

        const resources = client.getContainer(containerId, schema);
        await assert.doesNotReject(
            resources,
            () => true,
            "container cannot be retrieved from Azure Fluid Relay",
        );

        const { container } = await resources;
        assert.deepStrictEqual(Object.keys(container.initialObjects), Object.keys(schema.initialObjects));
    });

    /**
     * Scenario: test if Azure Client can get a non-exiting container.
     *
     * Expected behavior: an error should be thrown when trying to get a non-existent container.
     */
    it("cannot load improperly created container (cannot load a non-existent container)", async () => {
        const containerAndServicesP = client.getContainer("containerConfig", schema);

        const errorFn = (error) => {
            assert.notStrictEqual(error.message, undefined, "Azure Client error is undefined");
            return true;
        };

        await assert.rejects(
            containerAndServicesP,
            errorFn,
            "Azure Client can load a non-existent container",
        );
    });

    /**
     * Scenario: test when an Azure Client container is created,
     * it is initially detached.
     *
     * Expected behavior: an error should not be thrown nor should a rejected promise
     * be returned.
     */
    it("Created container is detached", async () => {
        const { container } = await client.createContainer(schema);
        assert.strictEqual(container.attachState, AttachState.Detached, "Container should be detached");
    });

    /**
     * Scenario: Test attaching a container and if a container can be attached twice.
     *
     * Expected behavior: an error should not be thrown nor should a rejected promise
     * be returned.
     */
    it("Creates a container that can only be attached once", async () => {
        const { container } = await client.createContainer(schema);
        const containerId = await container.attach();

        assert.strictEqual(
            typeof (containerId), "string",
            "Attach did not return a string ID",
        );
        assert.strictEqual(
            container.attachState, AttachState.Attached,
            "Container is attached after attach is called",
        );
        await assert.rejects(
            container.attach(),
            () => true,
            "Container should not attached twice",
        );
    });

    /**
     * Scenario: test when an Azure Client container is created,
     * it can set the initial objects.
     *
     * Expected behavior: an error should not be thrown nor should a rejected promise
     * be returned.
     */
    it("can set initial objects for a container", async () => {
        const { container: newContainer } = await client.createContainer(schema);
        const containerId = await newContainer.attach();

        const resources = client.getContainer(containerId, schema);
        await assert.doesNotReject(
            resources,
            () => true,
            "container cannot be retrieved from Azure Fluid Relay",
        );

        const { container } = await resources;
        assert.deepStrictEqual(Object.keys(container.initialObjects), Object.keys(schema.initialObjects));
    });

    /**
     * Scenario: test if initialObjects passed into the container functions correctly.
     *
     * Expected behavior: initialObjects value loaded in two different containers should mirror
     * each other after value is changed.
     */
    it("can change initialObjects value", async () => {
        const { container } = await client.createContainer(schema);
        const containerId = await container.attach();

        const initialObjectsCreate = container.initialObjects;
        const map1Create = initialObjectsCreate.map1 as SharedMap;
        map1Create.set("new-key", "new-value");
        const valueCreate = await map1Create.get("new-key");

        const containerGet = (await client.getContainer(containerId, schema)).container;
        const map1Get = containerGet.initialObjects.map1 as SharedMap;
        const valueGet = await map1Get.get("new-key");
        assert.strictEqual(valueGet, valueCreate, "container can't connect with initial objects");
    });

    /**
     * Scenario: test if the optional schema parameter, dynamicObjectTypes (DDS),
     * can be added during runtime and be returned by the container.
     *
     * Expected behavior: added loadable object can be retrieved from the container. Loadable
     * object's id and container config ID should be identical since it's now attached to
     * the container.
     */
     it("can create/add loadable objects (DDS) dynamically during runtime", async () => {
        const dynamicSchema: ContainerSchema = {
            initialObjects: {
                map1: SharedMap,
            },
            dynamicObjectTypes: [SharedDirectory],
        };

        const container = (await client.createContainer(dynamicSchema)).container;

        const map1 = container.initialObjects.map1 as SharedMap;
        const newPair = await container.create(SharedDirectory);
        map1.set("newpair-id", newPair.handle);
        const obj = await map1.get("newpair-id").get();
        assert.strictEqual(obj[Symbol.toStringTag], "SharedDirectory", "container added dynamic objects incorrectly");
    });

    /**
     * Scenario: test if the optional schema parameter, dynamicObjectTypes (custom data objects),
     * can be added during runtime and be returned by the container.
     *
     * Expected behavior: added loadable object can be retrieved from the container. Loadable
     * object's id and containeronfig ID should be identical since it's now attached to
     * the container.
     */
    it("can create/add loadable objects (custom data object) dynamically during runtime", async () => {
        const dynamicSchema: ContainerSchema = {
            initialObjects: {
                map1: SharedMap,
            },
            dynamicObjectTypes: [TestDataObject],
        };

        const createFluidContainer = (await client.createContainer(dynamicSchema)).container;

        const newPair = await createFluidContainer.create(TestDataObject);
        assert.ok(newPair?.handle);

        const map1 = createFluidContainer.initialObjects.map1 as SharedMap;
        map1.set("newpair-id", newPair.handle);
        const obj = await map1.get("newpair-id").get();
        assert.ok(obj, "container added dynamic objects incorrectly");
    });
});
