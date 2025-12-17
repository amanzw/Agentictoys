import React from 'react';
import { Container, Header, Box, SpaceBetween, Badge } from '@cloudscape-design/components';
import './eventDisplay.css';

class EventDisplay extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            events: []
        };
        this.maxEvents = 100; // 限制显示的事件数量
    }

    displayEvent(event, direction) {
        const timestamp = new Date().toLocaleTimeString();
        const eventType = event.event ? Object.keys(event.event)[0] : 'unknown';
        
        const eventItem = {
            id: Date.now() + Math.random(),
            timestamp,
            direction,
            eventType,
            event: event
        };

        this.setState(prevState => {
            const newEvents = [eventItem, ...prevState.events];
            // 保持最大事件数量限制
            return {
                events: newEvents.slice(0, this.maxEvents)
            };
        });
    }

    cleanup() {
        this.setState({ events: [] });
    }

    getEventBadgeVariant(eventType) {
        const eventTypeMap = {
            'sessionStart': 'blue',
            'sessionEnd': 'grey',
            'promptStart': 'green',
            'promptEnd': 'grey',
            'contentStart': 'blue',
            'contentEnd': 'grey',
            'textInput': 'blue',
            'audioInput': 'blue',
            'textOutput': 'green',
            'audioOutput': 'green',
            'toolUse': 'red',
            'toolResult': 'red',
            'usageEvent': 'grey'
        };
        return eventTypeMap[eventType] || 'grey';
    }

    render() {
        return (
            <Container
                header={<Header variant="h3">Event Log</Header>}
            >
                <div className="event-log">
                    <SpaceBetween direction="vertical" size="xs">
                        {this.state.events.map(eventItem => (
                            <Box key={eventItem.id} padding="s">
                                <div className={`event-item ${eventItem.direction}`}>
                                    <div className="event-header">
                                        <span className="event-timestamp">{eventItem.timestamp}</span>
                                        <Badge color={this.getEventBadgeVariant(eventItem.eventType)}>
                                            {eventItem.eventType}
                                        </Badge>
                                        <Badge color={eventItem.direction === 'in' ? 'blue' : 'green'}>
                                            {eventItem.direction === 'in' ? '← IN' : 'OUT →'}
                                        </Badge>
                                    </div>
                                    <div className="event-content">
                                        <pre>{JSON.stringify(eventItem.event, null, 2)}</pre>
                                    </div>
                                </div>
                            </Box>
                        ))}
                        {this.state.events.length === 0 && (
                            <Box textAlign="center" color="text-body-secondary">
                                No events to display
                            </Box>
                        )}
                    </SpaceBetween>
                </div>
            </Container>
        );
    }
}

export default EventDisplay;