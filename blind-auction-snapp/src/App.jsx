import React, { useCallback, useEffect, useState } from 'react';
import { render } from 'react-dom';
import { generateSudoku, cloneSudoku } from './sudoku-lib.js';

// some style params
let grey = '#cccccc';
let darkGrey = '#999999';
let lightGrey = '#f6f6f6';
let thick = 'black solid 4px';
let thin = `${grey} solid 1px`;
let sudokuWidth = 450;
let rightColumnWidth = 275;

let Sudoku; // this will hold the dynamically imported './sudoku-snapp.ts'

render(<App />, document.querySelector('#root'));

function App() {
  let [sudoku, setSudoku] = useState([]);
  let [ease, setEase] = useState(0.5);

  let [view, setView] = useState(1);
  let goForward = () => setView(2);
  let goBack = () => setView(1);
  return (
    <Container>
      {view === 1 ? (
        <GenerateSudoku {...{ setSudoku, ease, setEase, goForward }} />
      ) : (
        <SolveSudoku {...{ sudoku, goBack }} />
      )}
    </Container>
  );
}

function GenerateSudoku({
  setSudoku: setDeployedSudoku,
  ease,
  setEase,
  goForward,
}) {
  let [sudoku, setSudoku] = useState(() => generateSudoku(1 - ease));
  useEffect(() => {
    setSudoku(generateSudoku(1 - ease));
  }, [ease]);

  let [isLoading, setLoading] = useState(false);

  async function deploy() {
    if (isLoading) return;
    setLoading(true);
    Sudoku = await import('../dist/sudoku-snapp.js');
    await Sudoku.deploy(sudoku);
    setLoading(false);
    setDeployedSudoku(sudoku);
    goForward();
  }

  return (
    <Layout>
      <Header>Step 1. Generate a Sudoku</Header>

      <SudokuTable sudoku={sudoku} />

      <div style={{ width: rightColumnWidth + 'px' }}>
        <p>Adjust the difficulty:</p>
        <Space h="1.5rem" />

        <input
          type="range"
          value={ease * 100}
          style={{ width: '100%' }}
          onChange={(e) => {
            setEase(Number(e.target.value) / 100);
          }}
        />
        <Space h="2.5rem" />

        <Button onClick={deploy} disabled={isLoading}>
          Deploy
        </Button>
      </div>
    </Layout>
  );
}

function SolveSudoku({ sudoku, goBack }) {
  let [solution, setSolution] = useState(sudoku ?? []);
  let [snappState, pullSnappState] = useSnappState();

  let [isLoading, setLoading] = useState(false);

  async function submit() {
    if (isLoading) return;
    setLoading(true);
    await Sudoku.submitSolution(solution);
    await pullSnappState();
    setLoading(false);
  }

  return (
    <Layout>
      <Header goBack={goBack}>Step 2. Solve the Sudoku</Header>

      <SudokuTable
        sudoku={sudoku}
        editable
        solution={solution}
        setSolution={setSolution}
      />

      <div style={{ width: rightColumnWidth + 'px' }}>
        <p>Snapp state:</p>
        <Space h=".5rem" />

        <SnappState state={snappState} />
        <Space h="2.5rem" />

        <Button onClick={submit} disabled={isLoading}>
          Submit solution
        </Button>
      </div>
    </Layout>
  );
}

function useSnappState() {
  let [state, setState] = useState();
  let pullSnappState = useCallback(async () => {
    let state = await Sudoku?.getSnappState();
    setState(state);
    return state;
  });
  useEffect(() => {
    Sudoku?.getSnappState().then(setState);
  }, []);
  return [state, pullSnappState];
}

// pure UI components

function Header({ goBack, children }) {
  return (
    <div style={{ position: 'relative' }}>
      <h1 style={{ fontSize: '36px', textAlign: 'center' }}>{children}</h1>
      {goBack && (
        <div
          onClick={goBack}
          title="Back to step 1"
          style={{
            position: 'absolute',
            cursor: 'pointer',
            left: '25px',
            top: 0,
            fontSize: '40px',
          }}
        >
          👈
        </div>
      )}
    </div>
  );
}

function SudokuTable({ sudoku, editable, solution, setSolution }) {
  let cellSize = sudokuWidth / 9 + 'px';
  let fontSize = sudokuWidth / 18 + 'px';
  return (
    <table
      style={{
        border: thin,
        borderCollapse: 'collapse',
        fontSize,
      }}
    >
      <tbody>
        {sudoku.map((row, i) => (
          <tr key={i}>
            {row.map((x, j) => (
              <td
                key={j}
                style={{
                  width: cellSize,
                  height: cellSize,
                  borderRight: j === 2 || j === 5 ? thick : thin,
                  borderBottom: i === 2 || i === 5 ? thick : thin,
                }}
              >
                {!!x || !editable ? (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                  >
                    {x || ''}
                  </div>
                ) : (
                  <input
                    type="text"
                    value={solution[i][j] || ''}
                    style={{
                      width: '100%',
                      height: '100%',
                      textAlign: 'center',
                      fontSize,
                      backgroundColor: lightGrey,
                      border: thin,
                    }}
                    onChange={(e) => {
                      let newSudoku = cloneSudoku(solution);
                      newSudoku[i][j] = Number(e.target.value);
                      setSolution(newSudoku);
                    }}
                  ></input>
                )}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SnappState({ state = {} }) {
  let { sudokuHash = '', isSolved = false } = state;
  return (
    <div
      style={{
        backgroundColor: lightGrey,
        border: thin,
        padding: '8px',
      }}
    >
      <pre style={{ display: 'flex', justifyContent: 'space-between' }}>
        <b>sudokuHash</b>
        <span
          title={sudokuHash}
          style={{
            width: '100px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {sudokuHash}
        </span>
      </pre>
      <Space h=".5rem" />
      <pre style={{ display: 'flex', justifyContent: 'space-between' }}>
        <b>isSolved</b>
        <span style={{ color: isSolved ? 'green' : 'red' }}>
          {isSolved.toString()}
        </span>
      </pre>
    </div>
  );
}

function Button({ disabled = false, ...props }) {
  return (
    <button
      className="highlight"
      style={{
        color: disabled ? darkGrey : 'black',
        fontSize: '1rem',
        fontWeight: 'bold',
        backgroundColor: disabled ? 'white !important' : 'white',
        borderRadius: '10px',
        paddingTop: '10px',
        paddingBottom: '10px',
        width: '100%',
        border: disabled ? `4px ${darkGrey} solid` : '4px black solid',
        boxShadow: `${grey} 3px 3px 3px`,
        cursor: disabled ? undefined : 'pointer',
      }}
      disabled={disabled}
      {...props}
    />
  );
}

function Container(props) {
  return (
    <div
      style={{
        maxWidth: '900px',
        margin: 'auto',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        justifyContent: 'center',
        padding: '2rem',
      }}
      {...props}
    />
  );
}

function Layout({ children }) {
  let [header, left, right] = children;
  return (
    <>
      {header}
      <Space h="4rem" />
      <div style={{ display: 'flex' }}>
        {left}
        <Space w="4rem" />
        {right}
      </div>
    </>
  );
}

function Space({ w, h }) {
  return <div style={{ width: w, height: h }} />;
}
