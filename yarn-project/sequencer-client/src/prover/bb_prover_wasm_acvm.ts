import { BaseRollupInputs } from "@aztec/circuits.js";
import { BaseRollupArtifact, convertBaseRollupInputsToWitnessMap, serialiseInputWitness } from "@aztec/noir-protocol-circuits-types";
import * as fs from 'fs/promises';
import { WASMSimulator } from "../index.js";


export async function simulate_and_prove(inputs: BaseRollupInputs) {
  const compiledCircuit = BaseRollupArtifact;
  const decodedBytecode = Buffer.from(compiledCircuit.bytecode, 'base64');

  const witnessMap = convertBaseRollupInputsToWitnessMap(inputs);

  const simulator = new WASMSimulator();
  const outputWitnessMap = await simulator.simulateCircuit(witnessMap, compiledCircuit);

  //convert the witness map to TOML format
  let inputMap = '';
  witnessMap.forEach((value: string, key: number) => {
    inputMap = inputMap.concat(`${key} = '${value}'\n`);
  });

  const binaryWitness = await serialiseInputWitness(outputWitnessMap);

  const bytecodeFilename = 'bytecode.gz';
  const outputFilename = 'output_witness.gz';
  const inputFilename = 'input_witness.toml';
  const workingDirectory = '/tmp/proving';

  // In case the directory is still around from some time previously, remove it
  await fs.rm(workingDirectory, { recursive: true, force: true });
  // Create the new working directory
  await fs.mkdir(workingDirectory, { recursive: true });
  console.log("Writing outputs");
  // Write the bytecode and input witness to the working directory
  await fs.writeFile(`${workingDirectory}/${bytecodeFilename}`, decodedBytecode);
  await fs.writeFile(`${workingDirectory}/${outputFilename}`, binaryWitness);
  await fs.writeFile(`${workingDirectory}/${inputFilename}`, inputMap);
}