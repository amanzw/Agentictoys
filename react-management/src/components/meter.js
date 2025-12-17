import React from 'react';
import { Container, Header, ColumnLayout, Box, SpaceBetween } from '@cloudscape-design/components';
import './meter.css';

class Meter extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            cost: 0,
            isRunning: false
        };
    }

    start() {
        this.setState({
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            cost: 0,
            isRunning: true
        });
    }

    stop() {
        this.setState({ isRunning: false });
    }

    updateMeter(message) {
        if (message.event && message.event.usageEvent) {
            const usage = message.event.usageEvent;
            const inputTokens = usage.inputTokens || 0;
            const outputTokens = usage.outputTokens || 0;
            const totalTokens = inputTokens + outputTokens;
            
            // 简化的成本计算 (实际成本请参考AWS定价)
            const inputCost = inputTokens * 0.00003; // $0.00003 per input token
            const outputCost = outputTokens * 0.00006; // $0.00006 per output token
            const cost = inputCost + outputCost;

            this.setState(prevState => ({
                inputTokens: prevState.inputTokens + inputTokens,
                outputTokens: prevState.outputTokens + outputTokens,
                totalTokens: prevState.totalTokens + totalTokens,
                cost: prevState.cost + cost
            }));
        }
    }

    render() {
        return (
            <Container
                header={<Header variant="h3">Token Usage & Cost</Header>}
            >
                <ColumnLayout columns={2}>
                    <SpaceBetween direction="vertical" size="s">
                        <Box>
                            <div className="metric">
                                <div className="metric-label">Input Tokens</div>
                                <div className="metric-value">{this.state.inputTokens.toLocaleString()}</div>
                            </div>
                        </Box>
                        <Box>
                            <div className="metric">
                                <div className="metric-label">Output Tokens</div>
                                <div className="metric-value">{this.state.outputTokens.toLocaleString()}</div>
                            </div>
                        </Box>
                    </SpaceBetween>
                    <SpaceBetween direction="vertical" size="s">
                        <Box>
                            <div className="metric">
                                <div className="metric-label">Total Tokens</div>
                                <div className="metric-value">{this.state.totalTokens.toLocaleString()}</div>
                            </div>
                        </Box>
                        <Box>
                            <div className="metric">
                                <div className="metric-label">Estimated Cost</div>
                                <div className="metric-value">${this.state.cost.toFixed(4)}</div>
                            </div>
                        </Box>
                    </SpaceBetween>
                </ColumnLayout>
                <Box margin={{ top: "s" }}>
                    <div className={`status ${this.state.isRunning ? 'running' : 'stopped'}`}>
                        Status: {this.state.isRunning ? 'Running' : 'Stopped'}
                    </div>
                </Box>
            </Container>
        );
    }
}

export default Meter;